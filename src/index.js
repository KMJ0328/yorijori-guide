// 요리조리 가이드 - 카카오톡 레시피 챗봇 (Cloudflare Workers)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 카카오 스킬서버 엔드포인트
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleKakaoSkill(request, env);
    }

    // 헬스체크
    if (url.pathname === '/') {
      return new Response('🍳 요리조리 가이드 서버 정상 작동 중!', {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    // 레시피 목록 조회 (디버그용)
    if (url.pathname === '/api/recipes') {
      return handleRecipeList(env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// ===== 카카오 스킬 핸들러 =====
async function handleKakaoSkill(request, env) {
  try {
    const body = await request.json();
    const utterance = body.userRequest?.utterance?.trim() || '';

    // /레시피 명령어 파싱
    const recipeMatch = utterance.match(/^\/?레시피\s+(.*)/);

    if (!recipeMatch) {
      return kakaoResponse(
        '안녕하세요! 🍳 요리조리 가이드입니다.\n\n' +
        '레시피를 검색하려면 아래처럼 입력해주세요:\n\n' +
        '/레시피 불고기\n' +
        '/레시피 김치찌개\n' +
        '/레시피 된장찌개'
      );
    }

    const menuName = recipeMatch[1].replace(/\s*(알려줘|만드는법|레시피|만들기|하는법|해줘|좀|요)\s*/g, '').trim();

    if (!menuName) {
      return kakaoResponse('어떤 요리의 레시피를 찾으시나요?\n예) /레시피 불고기');
    }

    // KV에서 레시피 검색
    const recipe = await findRecipe(menuName, env);

    if (recipe) {
      return kakaoResponse(formatRecipe(recipe));
    }

    // 유사 레시피 추천
    const suggestions = await findSimilar(menuName, env);
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

// ===== 레시피 검색 =====
async function findRecipe(menuName, env) {
  // 1. 정확 매칭
  let data = await env.RECIPES.get(menuName, 'json');
  if (data) return data;

  // 2. 별칭(alias) 매칭
  const aliases = await env.RECIPES.get('__aliases__', 'json') || {};
  const aliasKey = aliases[menuName];
  if (aliasKey) {
    data = await env.RECIPES.get(aliasKey, 'json');
    if (data) return data;
  }

  // 3. 부분 매칭 - 키 목록에서 검색
  const keyList = await env.RECIPES.get('__keys__', 'json') || [];
  for (const key of keyList) {
    if (key.includes(menuName) || menuName.includes(key)) {
      data = await env.RECIPES.get(key, 'json');
      if (data) return data;
    }
  }

  return null;
}

// ===== 유사 레시피 추천 =====
async function findSimilar(menuName, env) {
  const keyList = await env.RECIPES.get('__keys__', 'json') || [];
  const suggestions = [];

  for (const key of keyList) {
    // 한 글자라도 겹치는 키워드 찾기
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

// ===== 레시피 포맷팅 (카카오톡 최적화) =====
function formatRecipe(recipe) {
  let text = '';

  // 제목
  const title = cleanTitle(recipe.title || recipe.searchKeyword || '');
  text += `🍳 ${title}\n`;

  // 기본 정보
  const info = [];
  if (recipe.servings) info.push(recipe.servings);
  if (recipe.time) info.push(recipe.time);
  if (recipe.difficulty) info.push(recipe.difficulty);
  if (info.length > 0) {
    text += `📌 ${info.join(' | ')}\n`;
  }
  text += '\n';

  // 재료
  if (recipe.ingredients && recipe.ingredients.length > 0) {
    text += '🛒 준비 재료\n';
    recipe.ingredients.forEach((item, i) => {
      text += `${i + 1}. ${item}\n`;
    });
    text += '\n';
  }

  // 양념장
  if (recipe.sauce && recipe.sauce.length > 0) {
    text += '🧂 양념장\n';
    recipe.sauce.forEach((item, i) => {
      text += `${i + 1}. ${item}\n`;
    });
    text += '\n';
  }

  // 조리 순서
  if (recipe.steps && recipe.steps.length > 0) {
    text += '👨‍🍳 조리 순서\n';
    recipe.steps.forEach((step, i) => {
      text += `${i + 1}. ${step}\n`;
    });
    text += '\n';
  }

  // 꿀팁
  if (recipe.tip) {
    text += `💡 꿀팁: ${recipe.tip}\n`;
  }

  // 카카오톡 텍스트 제한 (1000자)
  if (text.length > 990) {
    text = text.substring(0, 987) + '...';
  }

  return text;
}

function cleanTitle(title) {
  // 불필요한 수식어 제거
  return title
    .replace(/\[.*?\]/g, '')
    .replace(/【.*?】/g, '')
    .replace(/★/g, '')
    .replace(/[~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ===== 카카오 응답 포맷 =====
function kakaoResponse(text) {
  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: {
            text: text
          }
        }
      ]
    }
  };

  return new Response(JSON.stringify(response), {
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

// ===== 레시피 목록 API (디버그용) =====
async function handleRecipeList(env) {
  try {
    const keyList = await env.RECIPES.get('__keys__', 'json') || [];
    return new Response(JSON.stringify({
      count: keyList.length,
      recipes: keyList
    }, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
