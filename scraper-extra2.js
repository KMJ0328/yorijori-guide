const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 밀푀유나베 + 트렌디/인기 요리 + 일식/양식/중식 추가
const EXTRA_KEYWORDS = [
  // 나베/전골류
  '밀푀유나베', '스키야키', '샤브샤브', '부대전골', '버섯전골',
  '곱창전골', '해물전골', '김치전골', '만두전골', '소고기전골',
  // 일식 추가
  '돈카츠', '치킨카츠', '새우튀김', '가라아게', '타코야키',
  '오코노미야키', '일본카레', '미소된장국', '에비텐동', '사케동',
  '연어초밥', '유부우동', '나베우동', '야키소바', '규카츠',
  '오야코동', '가츠동', '텐동', '라멘',
  // 양식 추가
  '감바스', '뇨끼', '라자냐', '피자', '미트볼파스타',
  '봉골레파스타', '해물리조또', '버섯리조또', '치킨커리',
  '비프스튜', '클램차우더', '미네스트로네', '시저샐러드',
  '카프레제', '브루스케타', '에그베네딕트', '팬케이크',
  '와플', '크로크무슈', '수플레오믈렛', '감자그라탕',
  '치킨텐더', '피시앤칩스', '나초', '퀘사디아',
  '부리또', '타코', '또띠아랩',
  // 중식 추가
  '마라탕', '마라샹궈', '꿔바로우', '라조기', '양장피',
  '팔보채', '새우볶음밥', 'XO볶음밥', '게살볶음밥',
  '중국냉면', '단짜면', '울면', '물만두', '군만두전골',
  '춘권', '딤섬', '소룡포', '계란볶음밥',
  // 동남아
  '팟타이', '똠양꿍', '카오팟', '그린커리', '레드커리',
  '나시고렝', '미고렝', '분짜', '쌀국수', '반미',
  '월남쌈',
  // 트렌디/인기
  '크림떡볶이', '로제떡볶이', '로제파스타', '원팬파스타',
  '마약계란', '마약옥수수', '간장계란밥', '날치알밥',
  '연어포케', '참치포케', '아보카도명란밥', '크림우동',
  '명란파스타', '명란크림우동', '토마토달걀볶음',
  '에그인헬', '치즈폰듀', '라클렛',
  // 간식/디저트 추가
  '붕어빵', '타코야끼', '크레페', '마카롱', '티라미수',
  '팬케이크', '츄러스', '도넛', '토스트',
  '에그타르트', '크로플', '소금빵',
  // 음료 추가
  '밀크티', '버블티', '아이스티', '레모네이드',
  // 샐러드/건강식
  '포케볼', '그릭샐러드', '콥샐러드', '퀴노아샐러드',
  '닭가슴살볶음밥', '두부샐러드',
  // 안주
  '치킨윙', '양념치킨', '간장치킨', '닭똥집볶음',
  '골뱅이소면', '해물찜', '조개찜', '가리비버터구이',
  '새우버터구이',
];

const FINAL_PATH = path.join(__dirname, 'src', 'recipes-final.json');

function loadFinal() {
  try { return JSON.parse(fs.readFileSync(FINAL_PATH, 'utf-8')); }
  catch { return {}; }
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

async function scrapeFrom10000(page, keyword) {
  const searchUrl = `https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const recipeUrl = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a')).filter(a => /\/recipe\/\d+$/.test(a.href));
    return links.length > 0 ? links[0].href : null;
  });
  if (!recipeUrl) return null;

  await page.goto(recipeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const title = document.querySelector('.view2_summary h3')?.textContent?.trim() || '';
    const servings = document.querySelector('.view2_summary_info1')?.textContent?.trim() || '';
    const time = document.querySelector('.view2_summary_info2')?.textContent?.trim() || '';
    const difficulty = document.querySelector('.view2_summary_info3')?.textContent?.trim() || '';

    const ingredients = [], sauce = [];
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
      if (text && text.length > 100) {
        const first = text.match(/^[^.!?]+[.!?]/);
        text = first ? first[0] : text.substring(0, 80) + '...';
      }
      if (text) steps.push(text);
    });

    return {
      title, servings, time, difficulty, ingredients, sauce, steps,
      mainImage: document.querySelector('.centeredcrop img')?.src || '',
      sourceUrl: window.location.href,
      source: '만개의레시피'
    };
  });
}

async function main() {
  const finalData = loadFinal();
  const toScrape = EXTRA_KEYWORDS.filter(k => !finalData[k]);
  console.log(`=== 추가 스크래핑 (${toScrape.length}개, 기존 ${Object.keys(finalData).length}개) ===\n`);

  if (toScrape.length === 0) { console.log('추가할 레시피 없음'); return; }

  let browser, page;
  let success = 0, fail = 0;
  try { ({ browser, page } = await createBrowser()); }
  catch (e) { console.error('브라우저 실패'); return; }

  for (let i = 0; i < toScrape.length; i++) {
    const keyword = toScrape[i];
    console.log(`[${i+1}/${toScrape.length}] "${keyword}" ...`);

    try {
      const recipe = await scrapeFrom10000(page, keyword);
      if (recipe && recipe.title && recipe.steps.length > 0) {
        recipe.searchKeyword = keyword;
        finalData[keyword] = recipe;
        success++;
        console.log(`  ✓ "${recipe.title}" (재료${recipe.ingredients.length} ${recipe.steps.length}단계)`);
      } else {
        console.log(`  ✗ 데이터 부족`);
        fail++;
      }
    } catch (err) {
      console.log(`  ✗ ${err.message.substring(0, 50)}`);
      fail++;
      if (err.message.includes('crash') || err.message.includes('Target')) {
        try { await browser.close(); } catch {}
        await new Promise(r => setTimeout(r, 2000));
        try { ({ browser, page } = await createBrowser()); }
        catch { break; }
      }
    }

    await new Promise(r => setTimeout(r, 800));
    if (i % 20 === 19) {
      fs.writeFileSync(FINAL_PATH, JSON.stringify(finalData, null, 2), 'utf-8');
      console.log(`  [저장] 총 ${Object.keys(finalData).length}개`);
    }
  }

  try { await browser.close(); } catch {}
  fs.writeFileSync(FINAL_PATH, JSON.stringify(finalData, null, 2), 'utf-8');

  console.log(`\n=== 완료 ===`);
  console.log(`새로 추가: ${success}개 / 실패: ${fail}개`);
  console.log(`최종 총합: ${Object.keys(finalData).length}개`);
}

main().catch(console.error);
