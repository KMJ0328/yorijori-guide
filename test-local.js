// 정규식 테스트
const tests = ['/레시피 불고기', '레시피 불고기', '/레시피 맛있는 김치찌개 알려줘', '레시피 된장찌개'];
const regex = /^\/?레시피\s+(.*)/;

tests.forEach(t => {
  const m = t.match(regex);
  console.log(`"${t}" → ${m ? `match: "${m[1]}"` : 'NO MATCH'}`);
});
