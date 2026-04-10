// 레시피 데이터 정리 스크립트
// - 양념장/재료에 섞인 "계량 단위" 설명 제거
// - "만드는 법" 텍스트가 재료에 섞인 것 제거
// - 조리 단계 깔끔하게 정리

const fs = require('fs');
const path = require('path');

const FINAL_PATH = path.join(__dirname, 'src', 'recipes-final.json');
const data = JSON.parse(fs.readFileSync(FINAL_PATH, 'utf-8'));

let fixedCount = 0;

for (const [key, recipe] of Object.entries(data)) {
  let fixed = false;

  // 1. 재료/양념에서 "계량 단위" 이후 텍스트 제거
  const cleanList = (arr) => {
    if (!arr) return arr;
    return arr
      .map(item => {
        // "후춧가루 약간* 계량 단위..." 같은 패턴
        let cleaned = item.replace(/\*\s*계량\s*단위.*$/s, '').trim();
        // "000ml)만드는 법..." 같은 패턴
        cleaned = cleaned.replace(/\d*ml\)만드는\s*법.*$/s, '').trim();
        // "만드는 법1. ..." 이후 제거
        cleaned = cleaned.replace(/만드는\s*법\d*\..*$/s, '').trim();
        // 빈 괄호나 숫자만 남은 것 제거
        if (cleaned.length < 2) return null;
        return cleaned;
      })
      .filter(Boolean);
  };

  const origIngLen = recipe.ingredients?.length || 0;
  const origSauceLen = recipe.sauce?.length || 0;

  recipe.ingredients = cleanList(recipe.ingredients);
  recipe.sauce = cleanList(recipe.sauce);

  if (recipe.ingredients?.length !== origIngLen || recipe.sauce?.length !== origSauceLen) {
    fixed = true;
  }

  // 2. 조리 단계 정리
  if (recipe.steps) {
    recipe.steps = recipe.steps
      .map(step => {
        let s = step.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        // 번호 접두사 제거 (이미 번호 매기므로)
        s = s.replace(/^\d+\.\s*/, '');
        // 80자 제한
        if (s.length > 80) s = s.substring(0, 77) + '...';
        return s;
      })
      .filter(s => s.length > 3);

    // 중복 단계 제거
    recipe.steps = [...new Set(recipe.steps)];
  }

  // 3. 팁에서 불필요한 공백/탭 정리
  if (recipe.tip) {
    recipe.tip = recipe.tip.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (recipe.tip.length > 100) {
      recipe.tip = recipe.tip.substring(0, 97) + '...';
    }
  }

  // 4. 제목 정리
  if (recipe.title) {
    recipe.title = recipe.title
      .replace(/\[.*?\]/g, '')
      .replace(/【.*?】/g, '')
      .replace(/★/g, '')
      .replace(/[~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (fixed) fixedCount++;
}

fs.writeFileSync(FINAL_PATH, JSON.stringify(data, null, 2), 'utf-8');
console.log(`정리 완료! ${fixedCount}개 레시피 수정됨`);
console.log(`총 ${Object.keys(data).length}개 레시피`);

// 불고기 확인
const bulgogi = data['불고기'];
if (bulgogi) {
  console.log('\n=== 불고기 양념장 확인 ===');
  bulgogi.sauce?.forEach((s, i) => console.log(`${i+1}. ${s}`));
}
