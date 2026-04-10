const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EXTRA_KEYWORDS = [
  // 한식 보충
  '갈비구이', '양념게장', '간장게장', '꽃게무침', '해물탕',
  '조기구이', '갈치구이', '갈치조림', '코다리찜', '아귀탕',
  '낙곱새', '곱도리탕', '닭발', '매운닭발',
  '묵사발', '도토리묵무침', '메밀국수', '비빔막국수',
  '냉모밀', '열무비빔밥', '쌈밥', '보리밥', '콩밥',
  '나물밥', '전주콩나물국밥', '순대국밥', '돼지국밥',
  '소머리국밥', '뼈다귀해장국', '우거지탕',
  '된장찌개', '김치수제비', '호박찌개', '들깨탕',
  '곤드레밥', '비빔당면', '잔치잡채',
  '고구마튀김', '야채튀김', '모듬전', '수정과',
  '해물잡탕밥', '오징어덮밥', '카레볶음밥',
  '치즈김밥', '참치김밥', '충무김밥', '꼬마김밥',
  '누룽지', '누룽지탕',
  // 양식 보충
  '볼로네제', '뇨끼크림소스', '해물스파게티',
  '치킨파르미자나', '바질페스토파스타', '트러플파스타',
  '미트소스파스타', '크림수프', '양송이수프', '감자수프',
  '토마토수프', '브로콜리수프', '옥수수수프',
  '치킨까스', '생선까스', '새우까스',
  '비프커틀릿', '치킨까르보나라',
  '에그샌드위치', '클럽샌드위치', 'BLT샌드위치',
  '참치샌드위치', '스테이크샌드위치',
  '감자튀김', '어니언링', '모짜렐라스틱',
  '갈릭브레드', '마늘빵',
  // 일식 보충
  '연어회덮밥', '장어덮밥', '소바', '냉소바',
  '나가사키짬뽕', '미소라멘', '돈코츠라멘',
  '일본식카레우동', '볶음소바', '냉우동',
  '두부스테이크', '일본식햄버그',
  '타마고야키', '차완무시',
  // 중식 보충
  '짜장밥', '해물짬뽕밥', '고추잡채', '어향가지',
  '마라쭈꾸미', '오향장육', '연두부찜',
  '계란탕', '새우만두', '교자만두',
  // 동남아 보충
  '카야토스트', '망고라씨', '코코넛카레',
  '옐로커리', '닭볶음면', '볶음쌀국수',
  '분보후에', '반쎄오',
  // 건강식/다이어트
  '닭가슴살샌드위치', '그래놀라', '오버나이트오트밀',
  '스무디볼', '아사이볼', '프로틴팬케이크',
  '저탄수화물빵', '곤약볶음밥', '두부면파스타',
  // 브런치
  '에그인어홀', '크록마담', '아보카도토스트',
  '리코타치즈샐러드', '훈제연어샐러드',
  '베이글샌드위치', '바나나팬케이크',
  // 간식 보충
  '마들렌', '스콘', '브라우니', '쿠키',
  '초코칩쿠키', '치즈케이크', '바스크치즈케이크',
  '당근케이크', '레몬케이크', '파운드케이크',
  '롤케이크', '생크림케이크', '떡케이크',
  '경단', '화전', '수제초콜릿',
  '캐러멜팝콘', '군고구마', '군밤',
  '붕어빵', '타이야키', '호두과자',
  // 음료 보충
  '카페라떼', '카푸치노', '아인슈페너',
  '바닐라라떼', '모카라떼', '녹차라떼',
  '고구마라떼', '단호박라떼',
  '유자에이드', '자몽에이드', '청포도에이드',
  '딸기스무디', '망고스무디', '바나나스무디',
];

const FINAL_PATH = path.join(__dirname, 'src', 'recipes-final.json');

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
  const finalData = JSON.parse(fs.readFileSync(FINAL_PATH, 'utf-8'));
  const toScrape = EXTRA_KEYWORDS.filter(k => !finalData[k]);
  console.log(`=== 추가 스크래핑 (${toScrape.length}개, 기존 ${Object.keys(finalData).length}개) ===\n`);

  if (toScrape.length === 0) { console.log('추가할 레시피 없음'); return; }

  let browser, page, success = 0, fail = 0;
  try { ({ browser, page } = await createBrowser()); }
  catch { console.error('브라우저 실패'); return; }

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
        fail++;
        console.log(`  ✗ 데이터 부족`);
      }
    } catch (err) {
      fail++;
      console.log(`  ✗ ${err.message.substring(0, 50)}`);
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
