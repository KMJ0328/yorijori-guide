// 스크래핑 데이터를 Cloudflare KV에 업로드하는 스크립트
// 사용법: node upload-to-kv.js
// (wrangler CLI가 로그인된 상태여야 합니다)

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'src', 'recipes-final.json');

// 별칭 매핑 (오타, 줄임말, 유사어 → 실제 키)
const ALIASES = {
  '김찌': '김치찌개', '김치찌게': '김치찌개',
  '된찌': '된장찌개', '된장찌게': '된장찌개',
  '순두부': '순두부찌개', '순두부찌게': '순두부찌개',
  '부대찌게': '부대찌개',
  '제육': '제육볶음', '돼지불고기': '제육볶음',
  '김볶': '김치볶음밥',
  '달걀말이': '계란말이',
  '오뎅볶음': '어묵볶음',
  '감자채볶음': '감자볶음',
  '시금치무침': '시금치나물',
  '무채': '무생채',
  '떡볶기': '떡볶이',
  '라뽁이': '라볶이',
  '돈까스': '돈까스', '돈카츠': '돈까스',
  '까르보나라': '카르보나라',
  '자장면': '짜장면',
  '소고기덮밥': '규동', '돈부리': '규동',
  '달걀덮밥': '계란덮밥',
  '안동찜닭': '찜닭',
  '소갈비찜': '갈비찜',
  '닭도리탕': '닭볶음탕',
  '물냉면': '냉면',
  '함박': '함박스테이크',
  '마파': '마파두부',
  '알리오': '알리오올리오',
  '참치마요': '참치마요덮밥',
  '소떡': '소떡소떡',
  '달고나': '달고나커피',
  '치킨샐러드': '닭가슴살샐러드',
  '리조또': '리조또',
  '생일국': '미역국',
  '해장국': '콩나물국',
  '북어국': '북엇국',
  '춘천닭갈비': '닭갈비', '치즈닭갈비': '닭갈비',
  '소고기장조림': '장조림',
  '고등어': '고등어조림',
  '카레': '카레라이스',
  '채소죽': '야채죽',
  '전주비빔밥': '비빔밥',
  '달걀볶음밥': '볶음밥',
  '중국볶음면': '볶음면',
};

function main() {
  console.log('=== KV 업로드 준비 ===\n');

  if (!fs.existsSync(DATA_PATH)) {
    console.error('recipes-data.json 파일이 없습니다. 먼저 scraper.js를 실행하세요.');
    return;
  }

  const recipes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const keys = Object.keys(recipes);
  console.log(`레시피 ${keys.length}개 로드됨\n`);

  // KV bulk upload용 JSON 생성
  const kvPairs = [];

  // 1. 개별 레시피 저장
  for (const key of keys) {
    kvPairs.push({
      key: key,
      value: JSON.stringify(recipes[key])
    });
  }

  // 2. 키 목록 저장
  kvPairs.push({
    key: '__keys__',
    value: JSON.stringify(keys)
  });

  // 3. 별칭 저장
  kvPairs.push({
    key: '__aliases__',
    value: JSON.stringify(ALIASES)
  });

  // bulk upload 파일 생성
  const bulkPath = path.join(__dirname, 'kv-bulk-data.json');
  fs.writeFileSync(bulkPath, JSON.stringify(kvPairs, null, 2), 'utf-8');

  console.log(`KV 데이터 파일 생성: ${bulkPath}`);
  console.log(`총 ${kvPairs.length}개 항목 (레시피 ${keys.length} + 메타 2)\n`);

  console.log('=== 업로드 방법 ===');
  console.log('1. 먼저 KV namespace를 생성하세요:');
  console.log('   npx wrangler kv namespace create RECIPES\n');
  console.log('2. 생성된 id를 wrangler.toml에 입력하세요\n');
  console.log('3. 데이터를 업로드하세요:');
  console.log('   npx wrangler kv bulk put kv-bulk-data.json --namespace-id YOUR_ID\n');
  console.log('4. Worker를 배포하세요:');
  console.log('   npx wrangler deploy\n');
}

main();
