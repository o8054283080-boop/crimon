/**
 * 画面の機械的な検査。
 *
 * **型チェックとテストはCSSの安全弁にならない。**はみ出し・押せないボタン・
 * 小さすぎる文字・重なりは、どれも素通りする。ここはそれを目で見る前に
 * 機械で拾うための式で、ブラウザの中で評価される。
 *
 * 巡回(tour.mjs)と1画面の確認(scene.mts)の**両方が同じ式を使う**。
 * 別々に持つと、片方だけ検査が増えて「巡回は通ったのに崩れている」が起きる。
 */
export const INSPECT = `(() => {
  const problems = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 1. 横スクロール。縦画面で最も起きやすく、起きると全体が窮屈になる
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push('横にはみ出している (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
  }

  const nav = document.querySelector('.bottom-nav');
  const navTop = nav ? nav.getBoundingClientRect().top : vh;

  // 2. 押せないボタン。他の要素が上に乗っている/画面外にある
  const buttons = [...document.querySelectorAll('button:not([disabled]), a[href]')];
  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 画面の外(下タブの裏に隠れているものを含む)
    if (r.left < -2 || r.right > vw + 2) {
      problems.push('画面の外にあるボタン: ' + (b.textContent || '').trim().slice(0, 16));
      continue;
    }
    // 見えている位置にあるのに、最前面が自分でない
    const cx = Math.min(vw - 2, Math.max(2, r.x + r.width / 2));
    const cy = Math.min(vh - 2, Math.max(2, r.y + r.height / 2));
    if (cy > navTop - 2) continue; // 下タブの下は判定しない
    if (r.bottom < 0 || r.top > vh) continue; // 画面外(スクロールすれば見える)は許す
    const top = document.elementFromPoint(cx, cy);
    if (top && !b.contains(top) && top !== b && !b.closest('.bottom-nav')) {
      problems.push('押せないボタン「' + (b.textContent || '').trim().slice(0, 14) + '」の手前に ' + (top.className || top.tagName));
    }
  }

  // 3. 指で押すには小さすぎる的。
  //    実測したところ、並べ替えの札が29px、ショップの購入が31pxしかなく、
  //    **買う・編成するという取り返しのつかない操作ほど的が小さい**
  //    という逆転が起きていた。iPhone向けの44px基準を下回るものを拾う。
  const TAP_MIN = 44;
  for (const b of buttons) {
    if (b.closest('.dev-menu')) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.height < TAP_MIN || r.width < TAP_MIN) {
      problems.push('指で押すには小さい (' + Math.round(r.width) + 'x' + Math.round(r.height) + '): ' + ((b.textContent || '').trim().slice(0, 12) || b.className));
      break;
    }
  }

  // 4. 極端に小さい文字。実機で読めない
  for (const el of document.querySelectorAll('p, span, div, button')) {
    if (!el.textContent || el.children.length > 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size > 0 && size < 9) {
      problems.push('文字が小さすぎる (' + size.toFixed(1) + 'px): ' + el.textContent.trim().slice(0, 14));
      break;
    }
  }

  // 5. 見出しと重なっている要素(上帯の文字の重なりを何度も出しているため)
  const header = document.querySelector('.app-header h1, .battle-topbar__title');
  if (header) {
    const hr = header.getBoundingClientRect();
    for (const el of document.querySelectorAll('.battle-logstrip, .shop-notice, .app-subtitle')) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const overlap = !(r.bottom <= hr.top || r.top >= hr.bottom || r.right <= hr.left || r.left >= hr.right);
      if (overlap) problems.push('見出しと重なっている: ' + el.className);
    }
  }

  return { problems, ボタン数: buttons.length, 高さ: document.documentElement.scrollHeight };
})()`;
