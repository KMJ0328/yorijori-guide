// 요리조리 가이드 - 카카오톡 레시피 챗봇 (Cloudflare Workers)
// KV 대신 JSON 직접 내장 (무료 한도 걱정 없음)

import recipesData from './recipes-final.json';

// 별칭 매핑
const ALIASES = {
  '김찌': '김치찌개', '김치찌게': '김치찌개',
  '된찌': '된장찌개', '된장찌게': '된장찌개',
  '순두부': '순두부찌개', '부대찌게': '부대찌개',
  '제육': '제육볶음', '돼지불고기': '제육볶음',
  '김볶': '김치볶음밥', '달걀말이': '계란말이',
  '오뎅볶음': '어묵볶음', '감자채볶음': '감자볶음',
  '시금치무침': '시금치나물', '무채': '무생채',
  '떡볶기': '떡볶이', '돈카츠': '돈까스',
  '까르보나라': '카르보나라', '자장면': '짜장면',
  '소고기덮밥': '규동', '돈부리': '규동',
  '달걀덮밥': '계란덮밥', '안동찜닭': '찜닭',
  '소갈비찜': '갈비찜', '물냉면': '냉면',
  '함박': '함박스테이크', '마파': '마파두부',
  '알리오': '알리오올리오', '참치마요': '참치마요덮밥',
  '소떡': '소떡소떡', '달고나': '달고나커피',
  '치킨샐러드': '닭가슴살샐러드', '생일국': '미역국',
  '해장국': '콩나물국', '북어국': '북엇국',
  '춘천닭갈비': '닭갈비', '소고기장조림': '장조림',
  '고등어': '고등어조림', '카레': '카레라이스',
  '전주비빔밥': '비빔밥', '달걀볶음밥': '볶음밥',
  '닭도리탕': '닭볶음탕', '뼈해장국': '감자탕',
  '라뽁이': '라볶이', '리조또': '치즈리조또',
};

const RECIPE_KEYS = Object.keys(recipesData);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleKakaoSkill(request);
    }

    if (url.pathname === '/') {
      return new Response(`🍳 요리조리 가이드 서버 정상 작동 중! (${RECIPE_KEYS.length}개 레시피)`, {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/recipes') {
      return new Response(JSON.stringify({ count: RECIPE_KEYS.length, recipes: RECIPE_KEYS.sort() }, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

// ===== 카카오 스킬 핸들러 =====
async function handleKakaoSkill(request) {
  try {
    const body = await request.json();
    const utterance = body.userRequest?.utterance?.trim() || '';

    const recipeMatch = utterance.match(/^\/?레시피\s+(.*)/);

    if (!recipeMatch) {
      return kakaoResponse(
        '안녕하세요! 🍳 요리조리 가이드입니다.\n\n' +
        '레시피를 검색하려면 아래처럼 입력해주세요:\n\n' +
        '/레시피 불고기\n' +
        '/레시피 김치찌개\n' +
        '/레시피 된장찌개\n\n' +
        `현재 ${RECIPE_KEYS.length}개 레시피 보유 중!`
      );
    }

    const menuName = recipeMatch[1].replace(/\s*(알려줘|만드는법|레시피|만들기|하는법|해줘|좀|요)\s*/g, '').trim();

    if (!menuName) {
      return kakaoResponse('어떤 요리의 레시피를 찾으시나요?\n예) /레시피 불고기');
    }

    const recipe = findRecipe(menuName);

    if (recipe) {
      return kakaoResponse(formatRecipe(recipe));
    }

    const suggestions = findSimilar(menuName);
    if (suggestions.length > 0) {
      return kakaoResponse(
        `😅 "${menuName}" 레시피는 아직 준비 중이에요.\n\n` +
        `이런 레시피는 어떠세요?\n` +
        suggestions.map(s => `• /레시피 ${s}`).join('\n')
      );
    }

    return kakaoResponse(
      `😅 "${menuName}" 레시피를 찾지 못했어요.\n\n` +
      `다른 키워드로 다시 검색해보세요!\n` +
      `예) /레시피 불고기`
    );

  } catch (err) {
    console.error('Error:', err);
    return kakaoResponse('죄송해요, 일시적인 오류가 발생했어요. 다시 시도해주세요!');
  }
}

// ===== 레시피 검색 (메모리 내) =====
function findRecipe(menuName) {
  // 1. 정확 매칭
  if (recipesData[menuName]) return recipesData[menuName];

  // 2. 별칭 매칭
  const aliasKey = ALIASES[menuName];
  if (aliasKey && recipesData[aliasKey]) return recipesData[aliasKey];

  // 3. 부분 매칭
  for (const key of RECIPE_KEYS) {
    if (key.includes(menuName) || menuName.includes(key)) {
      return recipesData[key];
    }
  }

  return null;
}

// ===== 유사 레시피 추천 =====
function findSimilar(menuName) {
  const suggestions = [];
  for (const key of RECIPE_KEYS) {
    for (const char of menuName) {
      if (key.includes(char) && !suggestions.includes(key)) {
        suggestions.push(key);
        break;
      }
    }
    if (suggestions.length >= 5) break;
  }
  return suggestions;
}

// ===== 레시피 포맷팅 =====
function formatRecipe(recipe) {
  let text = '';

  const title = cleanTitle(recipe.title || recipe.searchKeyword || '');
  text += `🍳 ${title}\n`;

  const info = [];
  if (recipe.servings) info.push(recipe.servings);
  if (recipe.time) info.push(recipe.time);
  if (recipe.difficulty) info.push(recipe.difficulty);
  if (info.length > 0) text += `📌 ${info.join(' | ')}\n`;
  text += '\n';

  const toolWords = ['냄비', '도마', '나이프', '스푼', '밀폐', '프라이팬', '볼', '체', '거품기'];
  if (recipe.ingredients?.length > 0) {
    const filtered = recipe.ingredients.filter(item => !toolWords.some(t => item.includes(t)));
    text += '🛒 준비 재료\n';
    filtered.forEach((item, i) => { text += `${i + 1}. ${item}\n`; });
    text += '\n';
  }

  if (recipe.sauce?.length > 0) {
    text += '🧂 양념장\n';
    recipe.sauce.forEach((item, i) => { text += `${i + 1}. ${item}\n`; });
    text += '\n';
  }

  if (recipe.steps?.length > 0) {
    text += '👨‍🍳 조리 순서\n';
    recipe.steps.forEach((step, i) => {
      let clean = step.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean.length > 80) clean = clean.substring(0, 77) + '...';
      text += `${i + 1}. ${clean}\n`;
    });
    text += '\n';
  }

  if (recipe.tip) text += `💡 꿀팁: ${recipe.tip}\n`;

  // 출처
  if (recipe.source) {
    text += `\n📋 출처: ${recipe.source}`;
    if (recipe.sourceUrl) text += `\n${recipe.sourceUrl}`;
  }

  // 1000자 제한
  if (text.length > 950) {
    const sourceText = recipe.source ? `\n\n📋 출처: ${recipe.source}` : '';
    const maxContent = 940 - sourceText.length;
    const cutIdx = text.lastIndexOf('\n', maxContent);
    text = text.substring(0, cutIdx > 0 ? cutIdx : maxContent) + '\n...' + sourceText;
  }

  return text;
}

function cleanTitle(title) {
  return title.replace(/\[.*?\]/g, '').replace(/【.*?】/g, '').replace(/★/g, '').replace(/[~]+/g, '').replace(/\s+/g, ' ').trim();
}

function kakaoResponse(text) {
  return new Response(JSON.stringify({
    version: '2.0',
    template: { outputs: [{ simpleText: { text } }] }
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
