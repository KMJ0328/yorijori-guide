const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RECIPE_KEYWORDS = [
  '불고기', '제육볶음', '닭갈비', '잡채', '갈비찜', '닭볶음탕',
  '떡갈비', '소불고기', '닭강정', '보쌈', '족발', '삼겹살구이',
  'LA갈비', '수육', '닭도리탕',
  '김치찌개', '된장찌개', '순두부찌개', '부대찌개', '청국장찌개',
  '미역국', '떡국', '감자탕', '삼계탕', '육개장', '콩나물국',
  '떡만두국', '설렁탕', '갈비탕', '북엇국', '시래기국', '매운탕',
  '동태찌개', '김치국', '무국',
  '계란말이', '멸치볶음', '어묵볶음', '감자볶음', '시금치나물',
  '콩나물무침', '오이무침', '무생채', '감자조림', '두부조림',
  '장조림', '고등어조림', '김치볶음', '미나리무침', '깻잎장아찌',
  '가지볶음', '호박볶음', '진미채볶음', '우엉조림', '연근조림',
  '브로콜리무침', '도라지무침', '고추장아찌',
  '김치전', '파전', '해물파전', '감자전', '동그랑땡', '부추전',
  '호박전', '깻잎전', '녹두전',
  '김치볶음밥', '비빔밥', '볶음밥', '참치마요덮밥', '오므라이스',
  '김밥', '유부초밥', '주먹밥', '전복죽', '호박죽', '잡곡밥',
  '낙지덮밥', '카레라이스',
  '떡볶이', '라볶이', '잔치국수', '비빔국수', '칼국수', '쫄면',
  '냉면', '콩국수', '순대볶음', '볶음우동',
  '치즈떡볶이', '소떡소떡',
  '카르보나라', '토마토파스타', '크림파스타', '알리오올리오',
  '돈까스', '함박스테이크', '스테이크', '리조또', '그라탕',
  '닭가슴살샐러드', '프렌치토스트',
  '짜장면', '짬뽕', '마파두부', '탕수육', '볶음면',
  '깐풍기', '유린기',
  '규동', '우동', '계란덮밥', '연어덮밥',
  '찜닭', '돼지갈비찜', '아구찜', '계란찜',
  '호떡', '계란빵', '떡꼬치', '약과', '핫케이크',
  '달고나커피', '수정과', '식혜',
];

const OUTPUT_PATH = path.join(__dirname, 'src', 'recipes-data.json');

// 이미 수집된 데이터 불러오기
function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch { return {}; }
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

async function scrapeOne(page, keyword) {
  // 검색
  const searchUrl = `https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const recipeUrl = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'))
      .filter(a => /\/recipe\/\d+$/.test(a.href));
    return links.length > 0 ? links[0].href : null;
  });

  if (!recipeUrl) return null;

  // 개별 페이지
  await page.goto(recipeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const title = document.querySelector('.view2_summary h3')?.textContent?.trim() || '';
    const servings = document.querySelector('.view2_summary_info1')?.textContent?.trim() || '';
    const time = document.querySelector('.view2_summary_info2')?.textContent?.trim() || '';
    const difficulty = document.querySelector('.view2_summary_info3')?.textContent?.trim() || '';
    const intro = document.querySelector('#recipeIntro')?.textContent?.trim() || '';

    const ingredients = [];
    const sauce = [];

    document.querySelectorAll('.ready_ingre3 ul').forEach(ul => {
      const section = ul.querySelector('.ready_ingre3_tt')?.textContent?.trim() || '';
      const items = [];
      ul.querySelectorAll('li').forEach(li => {
        const name = li.querySelector('.ingre_list_name')?.textContent?.trim() || '';
        const amount = li.querySelector('.ingre_list_ea')?.textContent?.trim() || '';
        if (name) items.push(amount ? `${name} ${amount}` : name);
      });
      if (section.includes('양념') || section.includes('소스') || section.includes('드레싱') || section.includes('육수')) {
        sauce.push(...items);
      } else {
        ingredients.push(...items);
      }
    });

    const steps = [];
    document.querySelectorAll('.view_step_cont.media').forEach(el => {
      const addText = el.querySelector('.step_add')?.textContent?.trim() || '';
      let text = el.textContent?.trim().replace(addText, '').trim();
      if (text) steps.push(text);
    });

    const mainImage = document.querySelector('.centeredcrop img')?.src || '';

    return {
      title, servings, time, difficulty, intro,
      ingredients, sauce, steps, mainImage,
      sourceUrl: window.location.href
    };
  });
}

async function main() {
  console.log(`=== 스크래퍼 시작 (${RECIPE_KEYWORDS.length}개 키워드) ===\n`);

  const allRecipes = loadExisting();
  const alreadyDone = Object.keys(allRecipes).length;
  console.log(`기존 데이터: ${alreadyDone}개\n`);

  let browser, page;
  let successCount = alreadyDone;
  let failCount = 0;
  let crashCount = 0;

  try {
    ({ browser, page } = await createBrowser());
  } catch (e) {
    console.error('브라우저 시작 실패:', e.message);
    return;
  }

  for (let i = 0; i < RECIPE_KEYWORDS.length; i++) {
    const keyword = RECIPE_KEYWORDS[i];
    const progress = `[${i + 1}/${RECIPE_KEYWORDS.length}]`;

    if (allRecipes[keyword]) {
      console.log(`${progress} ${keyword} - 건너뜀`);
      continue;
    }

    try {
      console.log(`${progress} "${keyword}" 수집 중...`);
      const recipe = await scrapeOne(page, keyword);

      if (recipe && recipe.title && recipe.steps.length > 0) {
        recipe.searchKeyword = keyword;
        allRecipes[keyword] = recipe;
        successCount++;
        console.log(`  ✓ "${recipe.title}" (재료${recipe.ingredients.length} 양념${recipe.sauce.length} ${recipe.steps.length}단계)`);
      } else {
        console.log(`  ✗ 데이터 없음`);
        failCount++;
      }

      crashCount = 0; // 성공하면 리셋
    } catch (err) {
      console.log(`  ✗ 에러: ${err.message.substring(0, 60)}`);
      failCount++;
      crashCount++;

      // 크래시 시 브라우저 재시작
      if (err.message.includes('crash') || err.message.includes('Target') || crashCount >= 2) {
        console.log('  → 브라우저 재시작...');
        try { await browser.close(); } catch {}
        await new Promise(r => setTimeout(r, 2000));
        try {
          ({ browser, page } = await createBrowser());
          crashCount = 0;
          console.log('  → 재시작 완료');
        } catch (e2) {
          console.error('  → 재시작 실패:', e2.message);
          break;
        }
      }
    }

    // 요청 간격
    await new Promise(r => setTimeout(r, 1000));

    // 중간 저장 (10개마다)
    if (i % 10 === 9) {
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
