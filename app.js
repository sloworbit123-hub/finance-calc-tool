/* 자본의 이면 · 재테크 계산기 - 화면 제어 */
(function () {
  'use strict';

  var F = window.FinanceTool;
  var fmt = F.fmt;

  function $(id) { return document.getElementById(id); }
  function num(el, fallback) {
    var v = parseFloat(String(el.value).replace(/,/g, ''));
    return isFinite(v) ? v : fallback;
  }

  /* ───────────────────────── 탭 전환 ───────────────────────── */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panels = {
    salary: $('panelSalary'),
    dividend: $('panelDividend')
  };

  function activate(name) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    Object.keys(panels).forEach(function (key) {
      var p = panels[key];
      var on = key === name;
      p.classList.toggle('is-active', on);
      if (on) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    if (name === 'dividend') {
      // 숨겨진 동안에는 캔버스 폭이 0이므로 표시 후 다시 그린다
      requestAnimationFrame(function () { drawChart(lastDividend); });
    }
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { activate(t.dataset.tab); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = tabs.indexOf(t);
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      activate(next.dataset.tab);
    });
  });

  /* ───────────────────────── 탭 1 : 연봉 ───────────────────────── */
  var salaryInput = $('salaryInput');
  var familyGroup = $('familyGroup');
  var stdCreditInput = $('stdCreditInput');
  var familyCount = 1;

  function setBD(key, value) {
    var el = document.querySelector('#salaryBreakdown [data-k="' + key + '"]');
    if (el) el.textContent = value;
    var el2 = document.querySelector('#taxSteps [data-k="' + key + '"]');
    if (el2) el2.textContent = value;
  }

  function renderSalary() {
    var salaryMan = clampInput(salaryInput, 0, 100000);
    var r = F.calcSalary(salaryMan * 10000, familyCount, stdCreditInput.checked);

    $('netMonthly').innerHTML = fmt.number(r.netMonthly) + '<small>원</small>';
    $('netYearly').textContent = '연 실수령 ' + fmt.won(r.netYearly);
    $('totalDeduction').textContent = fmt.won(r.totalDeductionMonthly);
    $('insuranceMonthly').textContent = fmt.won(r.insuranceMonthly);
    $('taxMonthly').textContent = fmt.won(r.taxMonthly);
    $('effectiveRate').textContent = fmt.pct(r.effectiveTaxRate, 1);

    setBD('gross', fmt.won(r.monthlyGross));
    setBD('pension', fmt.won(r.pension));
    setBD('health', fmt.won(r.health));
    setBD('ltc', fmt.won(r.ltc));
    setBD('employment', fmt.won(r.employment));
    setBD('incomeTax', fmt.won(r.incomeTaxMonthly));
    setBD('localTax', fmt.won(r.localTaxMonthly));
    setBD('total', fmt.won(r.totalDeductionMonthly));
    setBD('net', fmt.won(r.netMonthly));

    setBD('grossYear', fmt.won(r.gross));
    setBD('earnedDed', fmt.won(r.earnedDeduction));
    setBD('personalDed', fmt.won(r.personalDeduction));
    setBD('insuranceDed', fmt.won(r.insuranceDeduction));
    setBD('taxBase', fmt.won(r.taxBase));
    setBD('calcTax', fmt.won(r.calculatedTax));
    setBD('earnedCredit', fmt.won(r.earnedCredit));
    setBD('stdCredit', fmt.won(r.standardCredit));
    setBD('taxYear', fmt.won(r.incomeTaxYear));

    document.querySelectorAll('.chip[data-salary]').forEach(function (c) {
      c.classList.toggle('is-active', Number(c.dataset.salary) === salaryMan);
    });

    renderSalaryTable(salaryMan);
    return r;
  }

  function clampInput(el, min, max) {
    var v = num(el, 0);
    if (v < min) v = min;
    if (v > max) { v = max; el.value = String(max); }
    return v;
  }

  var SALARY_TABLE = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 10000];

  function renderSalaryTable(currentMan) {
    var tbody = $('salaryTable').querySelector('tbody');
    var html = '';
    SALARY_TABLE.forEach(function (man) {
      var r = F.calcSalary(man * 10000, 1, true);
      var cur = man === currentMan ? ' class="is-current"' : '';
      html += '<tr' + cur + '>' +
        '<td>' + man.toLocaleString('ko-KR') + '만</td>' +
        '<td>' + fmt.number(r.netMonthly) + '원</td>' +
        '<td>' + fmt.number(r.totalDeductionMonthly) + '원</td>' +
        '<td>' + fmt.pct(r.effectiveTaxRate, 1) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  salaryInput.addEventListener('input', renderSalary);
  salaryInput.addEventListener('change', renderSalary);
  familyGroup.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg');
    if (!btn || !familyGroup.contains(btn)) return;
    familyCount = parseInt(btn.dataset.family, 10) || 1;
    Array.prototype.forEach.call(familyGroup.querySelectorAll('.seg'), function (b) {
      var on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderSalary();
  });
  stdCreditInput.addEventListener('change', renderSalary);

  document.querySelectorAll('.chip[data-salary]').forEach(function (c) {
    c.addEventListener('click', function () {
      salaryInput.value = c.dataset.salary;
      renderSalary();
    });
  });

  /* ───────────────────────── 탭 2 : 배당 ───────────────────────── */
  var initialInput = $('initialInput');
  var monthlyInput = $('monthlyInput');
  var divYieldInput = $('divYieldInput');
  var growthInput = $('growthInput');
  var yearsInput = $('yearsInput');
  var fxInput = $('fxInput');
  var reinvestInput = $('reinvestInput');

  var lastDividend = null;

  function renderDividend() {
    var r = F.calcDividend({
      initial: clampInput(initialInput, 0, 1000000) * 10000,
      monthly: clampInput(monthlyInput, 0, 100000) * 10000,
      divYield: clampInput(divYieldInput, 0, 30),
      growth: clampInput(growthInput, 0, 40),
      years: clampInput(yearsInput, 1, 40),
      fx: clampInput(fxInput, 500, 3000),
      reinvest: reinvestInput.checked
    });
    lastDividend = r;

    $('finalValue').innerHTML = fmt.number(r.finalKRW) + '<small>원</small>';
    $('finalValueUsd').textContent = fmt.usd(r.finalUSD) + ' · 원금 ' + fmt.wonShort(r.principal);
    $('netMonthlyDiv').textContent = fmt.won(r.netDivMonth);
    $('netYearlyDiv').textContent = fmt.won(r.netDivYear);
    $('profitValue').textContent = (r.profit >= 0 ? '+' : '') + fmt.won(r.profit);
    $('profitRate').textContent = (r.profitRate >= 0 ? '+' : '') + fmt.pct(r.profitRate, 1);

    renderGrowthTable(r);
    drawChart(r);
    return r;
  }

  function renderGrowthTable(r) {
    var tbody = $('growthTable').querySelector('tbody');
    var html = '';
    r.series.forEach(function (row) {
      html += '<tr>' +
        '<td>' + row.year + '년</td>' +
        '<td>' + fmt.number(row.valueKRW) + '원</td>' +
        '<td>' + fmt.number(row.netDivYearKRW) + '원</td>' +
        '<td>' + fmt.number(row.principalKRW) + '원</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  [initialInput, monthlyInput, divYieldInput, growthInput, yearsInput, fxInput].forEach(function (el) {
    el.addEventListener('input', renderDividend);
    el.addEventListener('change', renderDividend);
  });
  reinvestInput.addEventListener('change', renderDividend);

  /* ───────────────────────── 차트 ───────────────────────── */
  var canvas = $('growthChart');
  var ctx = canvas.getContext('2d');

  function shortWon(v) {
    if (v >= 100000000) {
      var eok = v / 100000000;
      return (eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10) + '억';
    }
    if (v >= 10000) return Math.round(v / 10000).toLocaleString('ko-KR') + '만';
    return Math.round(v).toLocaleString('ko-KR');
  }

  function drawChart(result) {
    if (!result || !result.series.length) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    var wrap = canvas.parentElement;
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (w <= 0 || h <= 0) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var padL = 46, padR = 44, padT = 12, padB = 24;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var rows = result.series;
    var maxVal = 0, maxDiv = 0;
    rows.forEach(function (row) {
      if (row.valueKRW > maxVal) maxVal = row.valueKRW;
      if (row.netDivYearKRW > maxDiv) maxDiv = row.netDivYearKRW;
    });
    if (maxVal <= 0) maxVal = 1;
    if (maxDiv <= 0) maxDiv = 1;

    var FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

    // 가로 그리드 + 왼쪽 축(평가금액)
    var gridLines = 4;
    for (var i = 0; i <= gridLines; i++) {
      var y = padT + (plotH * i) / gridLines;
      ctx.beginPath();
      ctx.strokeStyle = i === gridLines ? '#cdd8e8' : '#eef2f8';
      ctx.lineWidth = 1;
      ctx.moveTo(padL, y + 0.5);
      ctx.lineTo(padL + plotW, y + 0.5);
      ctx.stroke();

      ctx.fillStyle = '#8493ab';
      ctx.font = '600 10px ' + FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(shortWon(maxVal * (1 - i / gridLines)), padL - 6, y);
    }

    // 막대(평가금액)
    var n = rows.length;
    var step = plotW / n;
    var barW = Math.max(2, Math.min(26, step * 0.62));
    var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, '#4b8dfb');
    grad.addColorStop(1, '#1f5fd0');

    rows.forEach(function (row, idx) {
      var cx = padL + step * (idx + 0.5);
      var bh = (row.valueKRW / maxVal) * plotH;
      var y = padT + plotH - bh;
      ctx.fillStyle = grad;
      var x = cx - barW / 2;
      var radius = Math.min(3, barW / 2);
      drawRoundRect(ctx, x, y, barW, bh, radius);
      ctx.fill();
    });

    // 꺾은선(세후 연 배당금, 오른쪽 축)
    ctx.beginPath();
    ctx.strokeStyle = '#0f9d76';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    rows.forEach(function (row, idx) {
      var cx = padL + step * (idx + 0.5);
      var ly = padT + plotH - (row.netDivYearKRW / maxDiv) * plotH * 0.8;
      if (idx === 0) ctx.moveTo(cx, ly);
      else ctx.lineTo(cx, ly);
    });
    ctx.stroke();

    if (n <= 24) {
      rows.forEach(function (row, idx) {
        var cx = padL + step * (idx + 0.5);
        var ly = padT + plotH - (row.netDivYearKRW / maxDiv) * plotH * 0.8;
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(cx, ly, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = '#0f9d76';
        ctx.lineWidth = 1.6;
        ctx.arc(cx, ly, 2.8, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // 오른쪽 축(배당금) 눈금
    [0, 0.5, 1].forEach(function (ratio) {
      var y = padT + plotH - ratio * plotH * 0.8;
      ctx.fillStyle = '#0f9d76';
      ctx.font = '700 10px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(shortWon(maxDiv * ratio), padL + plotW + 6, y);
    });

    // 아래쪽 연도 라벨
    var labelEvery = n <= 10 ? 1 : n <= 20 ? 2 : 5;
    ctx.fillStyle = '#8493ab';
    ctx.font = '600 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    rows.forEach(function (row, idx) {
      if (row.year % labelEvery !== 0 && row.year !== n) return;
      var cx = padL + step * (idx + 0.5);
      ctx.fillText(row.year + '년', cx, padT + plotH + 8);
    });
  }

  function drawRoundRect(c, x, y, width, height, r) {
    if (height <= 0) height = 0;
    var radius = Math.min(r, width / 2, Math.max(height, 0.1));
    c.beginPath();
    c.moveTo(x, y + height);
    c.lineTo(x, y + radius);
    c.quadraticCurveTo(x, y, x + radius, y);
    c.lineTo(x + width - radius, y);
    c.quadraticCurveTo(x + width, y, x + width, y + radius);
    c.lineTo(x + width, y + height);
    c.closePath();
  }

  var resizeTimer = null;
  function scheduleRedraw() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!panels.dividend.classList.contains('is-active')) return;
      drawChart(lastDividend);
    }, 120);
  }
  window.addEventListener('resize', scheduleRedraw);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleRedraw).observe(canvas.parentElement);
  }

  /* ───────────────────────── 초기 실행 ───────────────────────── */
  renderSalary();
  renderDividend();

  // 검증·디버깅용 (계산 결과를 그대로 노출)
  window.FinanceToolApp = {
    activate: activate,
    renderSalary: renderSalary,
    renderDividend: renderDividend,
    drawChart: drawChart,
    get lastDividend() { return lastDividend; }
  };
})();
