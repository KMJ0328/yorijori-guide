const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RECIPE_KEYWORDS = [
  // 한식 메인
  '불고기', '제육볶음', '닭갈비', '잡채', '갈비찜', '닭볶음탕',
  '떡갈비', '닭강정', '보쌈', '수육', 'LA갈비',
  '소갈비구이', '삼겹살구이', '닭도리탕',
  // 찌개/국/탕
  '김치찌개', '된장찌개', '순두부찌개', '부대찌개', '청국장찌개',
  '미역국', '떡국', '감자탕', '삼계탕', '육개장', '콩나물국',
  '떡만두국', '설렁탕', '갈비탕', '북엇국', '시래기국', '매운탕',
  '동태찌개', '무국', '된장국', '소고기뭇국',
  // 반찬
  '계란말이', '멸치볶음', '어묵볶음', '감자볶음', '시금치나물',
  '콩나물무침', '오이무침', '무생채', '감자조림', '두부조림',
  '장조림', '고등어조림', '김치볶음', '가지볶음', '호박볶음',
  '우엉조림', '연근조림', '도라지무침', '깻잎장아찌', '미나리무침',
  '진미채볶음', '브로콜리무침',
  // 전/부침
  '김치전', '파전', '해물파전', '감자전', '동그랑땡', '부추전',
  '호박전', '깻잎전', '녹두전', '배추전',
  // 밥/죽
  '김치볶음밥', '비빔밥', '볶음밥', '참치마요덮밥', '오므라이스',
  '김밥', '유부초밥', '주먹밥', '전복죽', '호박죽',
  '낙지덮밥', '카레라이스', '치킨마요덮밥',
  // 면/분식
  '떡볶이', '라볶이', '잔치국수', '비빔국수', '칼국수', '쫄면',
  '냉면', '콩국수', '순대볶음', '볶음우동',
  '치즈떡볶이', '소떡소떡',
  // 양식
  '카르보나라', '토마토파스타', '크림파스타', '알리오올리오',
  '돈까스', '함박스테이크', '스테이크', '리조또', '그라탕',
  '프렌치토스트',
  // 중식
  '짜장면', '짬뽕', '마파두부', '탕수육', '볶음면',
  '깐풍기', '유린기',
  // 일식
  '규동', '우동', '계란덮밥', '카레우동',
  // 찜/조림
  '찜닭', '돼지갈비찜', '아구찜', '계란찜', '해물찜',
  // 간식
  '호떡', '계란빵', '떡꼬치', '약과', '핫케이크',
  // 음료
  '수정과', '식혜',
];

const OUTPUT_PATH = path.join(__dirname, 'src', 'recipes-naver.json');

function loadExisting() {
  try { return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function createBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  return { browser, page };
}

async function searchNaverCook(page, keyword) {
  const url = `https://terms.naver.com/search.naver?query=${encodeURIComponent(keyword)}&searchType=&dicType=&subject=48180`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const link = await page.evaluate((kw) => {
    const links = Array.from(document.querySelectorAll('a'))
      .filter(a => /entry\.naver/.test(a.href));
    // 텍스트가 있고 키워드 포함하는 것 우선
    for (const a of links) {
      const text = a.textContent?.trim();
      if (text && (text === kw || text.includes(kw))) return a.href;
    }
    // 없으면 첫 entry
    const first = links.find(a => a.textContent?.trim().length > 0);
    return first?.href || (links[0]?.href || null);
  }, keyword);
  return link;
}

async function scrapeNaverRecipe(page, url, keyword) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  return await page.evaluate((kw) => {
    const title = document.querySelector('.headword')?.textContent?.trim() || kw;
    const ct = document.querySelector('.size_ct_v2') || document.querySelector('#size_ct');
    if (!ct) return null;

    // h3 섹션으로 구분해서 파싱
    const h3s = Array.from(ct.querySelectorAll('h3.stress, h3'));
    const allParagraphs = Array.from(ct.querySelectorAll('p.txt'));

    let ingredients = [];
    let sauce = [];
    let steps = [];
    let tip = '';
    let servings = '';
    let currentSection = '재료'; // 기본

    // 목차 h3 건너뛰고 실제 섹션 h3 사용
    // 섹션 간 p.txt를 분류
    const sectionMap = {}; // sectionName -> [p texts]
    let curSection = '__intro__';

    const allElements = Array.from(ct.children);
    for (const el of allElements) {
      // h3 만나면 섹션 변경
      if (el.tagName === 'H3' || (el.querySelector && el.querySelector('h3.stress'))) {
        const h3Text = (el.tagName === 'H3' ? el : el.querySelector('h3.stress'))?.textContent?.trim() || '';
        if (h3Text === '목차') continue;
        curSection = h3Text;
        if (!sectionMap[curSection]) sectionMap[curSection] = [];
        continue;
      }
      // p.txt 수집
      const ps = el.tagName === 'P' ? [el] : Array.from(el.querySelectorAll?.('p.txt') || []);
      for (const p of ps) {
        const txt = p.textContent?.trim();
        if (txt && txt.length > 1) {
          if (!sectionMap[curSection]) sectionMap[curSection] = [];
          sectionMap[curSection].push(txt);
        }
      }
      // Tip 찾기
      if (el.textContent?.includes('Tip')) {
        const tipP = el.querySelector?.('p.txt') || el.nextElementSibling;
        if (tipP) {
          const tipText = tipP.textContent?.trim();
          if (tipText && tipText.length > 5) tip = tipText;
        }
      }
    }

    // 섹션별 데이터 분류
    for (const [section, texts] of Object.entries(sectionMap)) {
      const secLower = section.toLowerCase();

      if (secLower.includes('양념') || secLower.includes('소스') || secLower.includes('드레싱') ||
          secLower.includes('육수') || secLower.includes('밑간')) {
        // 양념장 섹션
        for (const t of texts) {
          const items = t.split(/,\s*/);
          sauce.push(...items.map(s => s.trim()).filter(s => s.length > 0));
        }
      } else if (secLower.includes('조리') || secLower.includes('만드는') || secLower.includes('만들기')) {
        // 조리순서 섹션
        for (const t of texts) {
          // "1. xxx" 형태면 번호 제거
          const cleaned = t.replace(/^\d+\.\s*/, '').trim();
          if (cleaned.length > 3) steps.push(cleaned);
        }
      } else if (secLower.includes('재료') || section === '__intro__') {
        // 재료 섹션
        for (const t of texts) {
          // "재료(N인분)" 형태 파싱
          const servMatch = t.match(/재료\s*\(?(\d+인분)\)?/);
          if (servMatch) {
            servings = servMatch[1];
            const rest = t.replace(/재료\s*\(?\d+인분\)?\s*/, '');
            if (rest) {
              const items = rest.split(/,\s*/);
              ingredients.push(...items.map(s => s.trim()).filter(s => s.length > 0));
            }
            continue;
          }
          // 일반 재료 텍스트 (쉼표 구분)
          if (t.includes(',') && !t.includes('.') && t.length < 500) {
            const items = t.split(/,\s*/);
            ingredients.push(...items.map(s => s.trim()).filter(s => s.length > 0));
          }
        }
      }
    }

    // 직접 h3 기반 파싱 (위에서 못 찾은 경우)
    if (ingredients.length === 0 && steps.length === 0) {
      let mode = 'none';
      for (const p of allParagraphs) {
        const txt = p.textContent?.trim();
        if (!txt) continue;

        // 바로 앞의 h3 확인
        let prev = p.previousElementSibling;
        while (prev && prev.tagName !== 'H3') prev = prev.previousElementSibling;
        const prevH3 = prev?.textContent?.trim()?.toLowerCase() || '';

        if (prevH3.includes('재료') || txt.match(/재료\s*\(/)) {
          const cleaned = txt.replace(/재료\s*\(?\d+인분\)?\s*/, '');
          const servMatch = txt.match(/(\d+인분)/);
          if (servMatch) servings = servMatch[1];
          if (cleaned.includes(',')) {
            ingredients.push(...cleaned.split(/,\s*/).map(s => s.trim()).filter(s => s));
          }
        } else if (prevH3.includes('양념') || prevH3.includes('소스')) {
          if (txt.includes(',')) {
            sauce.push(...txt.split(/,\s*/).map(s => s.trim()).filter(s => s));
          }
        } else if (prevH3.includes('조리') || prevH3.includes('만드는')) {
          const cleaned = txt.replace(/^\d+\.\s*/, '').trim();
          if (cleaned.length > 3) steps.push(cleaned);
        }
      }
    }

    // 최후의 수단: 모든 p.txt에서 패턴 매칭
    if (ingredients.length === 0) {
      for (const p of allParagraphs) {
        const txt = p.textContent?.trim();
        if (!txt) continue;
        // 재료 패턴: 쉼표 구분, 분량 단위 포함
        if (txt.includes(',') && /\d+(g|큰술|작은술|개|컵|ml|장|줌|마리|인분)/.test(txt) && txt.length < 300) {
          const items = txt.split(/,\s*/).map(s => s.trim()).filter(s => s);
          if (ingredients.length === 0) {
            ingredients = items;
          } else {
            sauce.push(...items);
          }
        }
      }
    }

    // 이미지
    const mainImage = ct.querySelector('.thmb img, img')?.src || '';

    return {
      title, servings, ingredients, sauce, steps, tip, mainImage,
      sourceUrl: window.location.href,
      source: '네이버 요리백과'
    };
  }, keyword);
}

async function main() {
  console.log(`=== 네이버 요리백과 스크래퍼 (${RECIPE_KEYWORDS.length}개) ===\n`);

  const allRecipes = loadExisting();
  // 파싱 실패했던 것들은 다시 시도
  for (const key of Object.keys(allRecipes)) {
    if (allRecipes[key].parseError || allRecipes[key].ingredients?.length === 0) {
      delete allRecipes[key];
    }
  }
  console.log(`유효 데이터: ${Object.keys(allRecipes).length}개\n`);

  let browser, page;
  let successCount = 0;
  let failCount = 0;

  try {
    ({ browser, page } = await createBrowser());
  } catch (e) {
    console.error('브라우저 시작 실패:', e.message);
    return;
  }

  for (let i = 0; i < RECIPE_KEYWORDS.length; i++) {
    const keyword = RECIPE_KEYWORDS[i];
    const progress = `[${i + 1}/${RECIPE_KEYWORDS.length}]`;

    if (allRecipes[keyword] && allRecipes[keyword].ingredients?.length > 0) {
      console.log(`${progress} ${keyword} - 건너뜀`);
      successCount++;
      continue;
    }

    try {
      console.log(`${progress} "${keyword}" 검색 중...`);
      const recipeUrl = await searchNaverCook(page, keyword);

      if (!recipeUrl) {
        console.log(`  ✗ 검색 결과 없음`);
        failCount++;
        continue;
      }

      const recipe = await scrapeNaverRecipe(page, recipeUrl, keyword);

      if (recipe && recipe.ingredients.length > 0) {
        recipe.searchKeyword = keyword;
        allRecipes[keyword] = recipe;
        successCount++;
        console.log(`  ✓ "${recipe.title}" (재료${recipe.ingredients.length} 양념${recipe.sauce.length} ${recipe.steps.length}단계)`);
      } else {
        console.log(`  ✗ 파싱 실패 (재료: ${recipe?.ingredients?.length}, 단계: ${recipe?.steps?.length})`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ✗ 에러: ${err.message.substring(0, 60)}`);
      failCount++;

      if (err.message.includes('crash') || err.message.includes('Target')) {
        console.log('  → 브라우저 재시작...');
        try { await browser.close(); } catch {}
        await new Promise(r => setTimeout(r, 2000));
        try {
          ({ browser, page } = await createBrowser());
          console.log('  → 재시작 완료');
        } catch { break; }
      }
    }

    await new Promise(r => setTimeout(r, 800));

    if (i % 15 === 14) {
      save(allRecipes);
      console.log(`  [저장] ${successCount}개`);
    }
  }

  try { await browser.close(); } catch {}
  save(allRecipes);

  console.log(`\n=============================`);
  console.log(`성공: ${successCount}개 / 실패: ${failCount}개`);
  console.log(`저장: ${OUTPUT_PATH}`);
  console.log(`=============================`);
}

main().catch(console.error);
