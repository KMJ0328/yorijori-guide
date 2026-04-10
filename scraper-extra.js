const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 추가 한식 레시피 키워드
const EXTRA_KEYWORDS = [
  // 고기 요리
  '돼지갈비', '양념갈비', '소갈비찜', '닭갈비찜', '불닭',
  '닭꼬치', '닭가슴살스테이크', '돼지목살스테이크', '삼겹살덮밥',
  '차돌박이숙주볶음', '소고기미역국', '돼지고기김치찌개',
  '제육덮밥', '고추장불고기', '간장불고기',
  // 국/찌개/탕 추가
  '시금치된장국', '아욱국', '소고기무국', '북어해장국',
  '차돌된장찌개', '참치찌개', '고추장찌개', '두부찌개',
  '갈비해장국', '선지해장국', '뼈해장국', '추어탕', '곰탕',
  '사골국', '어묵탕', '닭한마리', '해물칼국수',
  '들깨수제비', '수제비', '팥죽',
  // 반찬 추가
  '소세지야채볶음', '깻잎전', '느타리버섯볶음',
  '콩자반', '무조림', '메추리알조림', '꽈리고추멸치볶음',
  '마늘종볶음', '깻잎찜', '미역줄기볶음',
  '고구마줄기볶음', '고춧잎볶음', '취나물무침',
  '비름나물', '고사리나물', '숙주나물', '열무나물',
  '총각김치', '깍두기', '파김치', '부추김치',
  '배추김치', '동치미', '무말랭이무침',
  '오징어볶음', '낙지볶음', '쭈꾸미볶음', '주꾸미볶음',
  '골뱅이무침', '해물볶음',
  // 전/부침 추가
  '고구마전', '양배추전', '미니돈까스',
  // 밥 추가
  '돌솥비빔밥', '영양밥', '콩나물밥',
  '무밥', '잔치국수', '유부밥',
  '소고기덮밥', '회덮밥',
  // 면 추가
  '잡채밥', '막국수', '물냉면', '비빔냉면',
  '들깨칼국수', '해물짬뽕', '물만두', '군만두',
  '찐만두', '김치만두', '만두국',
  // 구이
  '삼치구이', '고등어구이', '꽁치구이', '가자미구이',
  '오징어구이', '조개구이',
  // 찜/탕
  '갈낙탕', '아귀찜', '동태탕',
  '대구탕', '꽃게탕', '꽃게찜',
  '해물뚝배기', '순대국',
  // 간식/디저트
  '감자떡', '찹쌀떡', '송편', '수수팥떡',
  '식빵', '고구마라떼', '유자차', '생강차',
  '매실차', '쌍화차',
  // 김치류
  '열무김치', '묵은지찜',
  // 기타 한식
  '해물잡채', '비빔당면', '골뱅이소면',
  '칡냉면', '매운어묵볶음', '고구마맛탕',
  '약밥', '쌀강정', '한과',
];

const FINAL_PATH = path.join(__dirname, 'src', 'recipes-final.json');
const OUTPUT_PATH = path.join(__dirname, 'src', 'recipes-extra.json');

function loadFinal() {
  try { return JSON.parse(fs.readFileSync(FINAL_PATH, 'utf-8')); }
  catch { return {}; }
}

function loadExtra() {
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
      // 80자 제한
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
  const extraData = loadExtra();
  const existing = new Set([...Object.keys(finalData), ...Object.keys(extraData)]);

  const toScrape = EXTRA_KEYWORDS.filter(k => !existing.has(k));
  console.log(`=== 추가 한식 스크래핑 (${toScrape.length}개) ===\n`);

  if (toScrape.length === 0) {
    console.log('추가할 레시피 없음');
    return;
  }

  let browser, page;
  let success = 0, fail = 0;

  try { ({ browser, page } = await createBrowser()); }
  catch (e) { console.error('브라우저 실패:', e.message); return; }

  for (let i = 0; i < toScrape.length; i++) {
    const keyword = toScrape[i];
    console.log(`[${i+1}/${toScrape.length}] "${keyword}" ...`);

    try {
      const recipe = await scrapeFrom10000(page, keyword);
      if (recipe && recipe.title && recipe.steps.length > 0) {
        recipe.searchKeyword = keyword;
        extraData[keyword] = recipe;
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
    if (i % 15 === 14) { save(extraData); console.log(`  [저장] ${success}개`); }
  }

  try { await browser.close(); } catch {}
  save(extraData);

  // final에 병합
  let merged = { ...finalData };
  for (const [k, v] of Object.entries(extraData)) {
    if (!merged[k]) merged[k] = v;
  }
  fs.writeFileSync(FINAL_PATH, JSON.stringify(merged, null, 2), 'utf-8');

  console.log(`\n=== 완료 ===`);
  console.log(`새로 추가: ${success}개 / 실패: ${fail}개`);
  console.log(`최종 총합: ${Object.keys(merged).length}개`);
}

main().catch(console.error);
