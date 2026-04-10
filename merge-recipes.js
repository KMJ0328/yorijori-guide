const fs = require('fs');
const path = require('path');

const naverData = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'recipes-naver.json'), 'utf-8'));
const tenthousandData = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'recipes-data.json'), 'utf-8'));

const merged = {};
let naverCount = 0;
let tenCount = 0;

// 1. 네이버 요리백과 우선 (재료가 있는 것만)
for (const [key, recipe] of Object.entries(naverData)) {
  if (recipe.ingredients && recipe.ingredients.length > 0 && !recipe.parseError) {
    merged[key] = recipe;
    naverCount++;
  }
}

// 2. 만개의레시피로 보충 (네이버에 없는 것)
for (const [key, recipe] of Object.entries(tenthousandData)) {
  if (!merged[key] && recipe.steps && recipe.steps.length > 0) {
    // 만개의레시피 데이터 정리: 긴 단계를 짧게
    recipe.steps = recipe.steps.map(step => {
      let clean = step.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      // 80자 넘으면 첫 문장만
      if (clean.length > 100) {
        const firstSentence = clean.match(/^[^.!?]+[.!?]/);
        if (firstSentence) clean = firstSentence[0];
        else clean = clean.substring(0, 80) + '...';
      }
      return clean;
    });
    recipe.source = '만개의레시피';
    merged[key] = recipe;
    tenCount++;
  }
}

// 저장
const outputPath = path.join(__dirname, 'src', 'recipes-final.json');
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), 'utf-8');

console.log(`=== 레시피 병합 완료 ===`);
console.log(`네이버 요리백과: ${naverCount}개`);
console.log(`만개의레시피: ${tenCount}개`);
console.log(`총합: ${Object.keys(merged).length}개`);
console.log(`저장: ${outputPath}`);

// 레시피 목록 출력
console.log('\n=== 전체 레시피 목록 ===');
Object.keys(merged).sort().forEach((key, i) => {
  const r = merged[key];
  const src = r.source === '네이버 요리백과' ? '[네]' : '[만]';
  console.log(`${String(i+1).padStart(3)}. ${src} ${key} - 재료${r.ingredients?.length || 0} 양념${r.sauce?.length || 0} ${r.steps?.length || 0}단계`);
});
