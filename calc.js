/* 자본의 이면 · 재테크 계산기 - 계산 엔진
   외부 라이브러리 없음. 2026년 기준 세율·보험료율. */
(function (global) {
  'use strict';

  var RATES = {
    year: 2026,
    // ── 4대보험 (근로자 부담) ──────────────────────────────
    pension: 0.0475,            // 국민연금 9.5% 중 근로자 절반
    pensionBaseMin: 410000,     // 기준소득월액 하한 (2026.7~2027.6)
    pensionBaseMax: 6590000,    // 기준소득월액 상한 (2026.7~2027.6)
    health: 0.03595,            // 건강보험 7.19% 중 근로자 절반
    ltcOfHealth: 0.1314,        // 노인장기요양보험 = 건강보험료의 13.14%
    employment: 0.009,          // 고용보험 실업급여분 근로자 절반
    // ── 세금 ──────────────────────────────────────────────
    localTaxRate: 0.1,          // 지방소득세 = 소득세의 10%
    standardCredit: 130000,     // 표준세액공제 13만원
    dividendTax: 0.154,         // 미국 배당소득 부담률 15.4% (지방소득세 포함)
    baseDeductionPerPerson: 1500000, // 기본공제 1인당 150만원
    earnedDeductionCap: 20000000     // 근로소득공제 한도 2,000만원
  };

  // 종합소득 기본세율 8구간 (소득세법 제55조)
  var TAX_BRACKETS = [
    { limit: 14000000, rate: 0.06, progressive: 0 },
    { limit: 50000000, rate: 0.15, progressive: 1260000 },
    { limit: 88000000, rate: 0.24, progressive: 5760000 },
    { limit: 150000000, rate: 0.35, progressive: 15440000 },
    { limit: 300000000, rate: 0.38, progressive: 19940000 },
    { limit: 500000000, rate: 0.40, progressive: 25940000 },
    { limit: 1000000000, rate: 0.42, progressive: 35940000 },
    { limit: Infinity, rate: 0.45, progressive: 65940000 }
  ];

  function floorTo(num, unit) {
    if (!isFinite(num) || num <= 0) return 0;
    return Math.floor(num / unit) * unit;
  }

  function clamp(num, min, max) {
    if (!isFinite(num)) return min;
    return Math.min(Math.max(num, min), max);
  }

  /* 근로소득공제 (소득세법 제47조) */
  function earnedIncomeDeduction(gross) {
    var d;
    if (gross <= 5000000) d = gross * 0.7;
    else if (gross <= 15000000) d = 3500000 + (gross - 5000000) * 0.4;
    else if (gross <= 45000000) d = 7500000 + (gross - 15000000) * 0.15;
    else if (gross <= 100000000) d = 12000000 + (gross - 45000000) * 0.05;
    else d = 14750000 + (gross - 100000000) * 0.02;
    return Math.min(d, RATES.earnedDeductionCap);
  }

  /* 산출세액 = 과세표준 × 세율 - 누진공제 */
  function calcTaxByBracket(base) {
    if (base <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (base <= TAX_BRACKETS[i].limit) {
        return Math.max(0, base * TAX_BRACKETS[i].rate - TAX_BRACKETS[i].progressive);
      }
    }
    return 0;
  }

  /* 근로소득세액공제 한도 (소득세법 제59조 제2항) */
  function earnedCreditLimit(gross) {
    if (gross <= 33000000) return 740000;
    if (gross <= 70000000) return Math.max(660000, 740000 - (gross - 33000000) * 0.008);
    if (gross <= 120000000) return Math.max(500000, 660000 - (gross - 70000000) * 0.5);
    return Math.max(200000, 500000 - (gross - 120000000) * 0.5);
  }

  /* 근로소득세액공제액 */
  function earnedCredit(calcTax, gross) {
    if (calcTax <= 0) return 0;
    var credit = calcTax <= 1300000
      ? calcTax * 0.55
      : 1300000 * 0.55 + (calcTax - 1300000) * 0.3;
    return Math.min(credit, earnedCreditLimit(gross));
  }

  function wageBand(base) {
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (base <= TAX_BRACKETS[i].limit) return TAX_BRACKETS[i].rate;
    }
    return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
  }

  /**
   * 연봉 실수령액 계산
   * @param {number} annualSalary 연 총급여(원)
   * @param {number} dependents 부양가족 수(본인 포함)
   * @param {boolean} useStandardCredit 표준세액공제 반영 여부
   */
  function calcSalary(annualSalary, dependents, useStandardCredit) {
    var gross = Math.max(0, Number(annualSalary) || 0);
    var people = clamp(Math.round(Number(dependents) || 1), 1, 10);
    var withStd = useStandardCredit !== false;

    var monthlyGross = gross / 12;

    // 국민연금: 기준소득월액 상·하한 적용 후 10원 미만 절사
    var pensionBase = clamp(monthlyGross, RATES.pensionBaseMin, RATES.pensionBaseMax);
    var pension = floorTo(pensionBase * RATES.pension, 10);
    var health = floorTo(monthlyGross * RATES.health, 10);
    var ltc = floorTo(health * RATES.ltcOfHealth, 10);
    var employment = floorTo(monthlyGross * RATES.employment, 10);
    var insuranceMonthly = pension + health + ltc + employment;

    // 소득세 (연간 기준으로 계산 후 월 분할)
    var earnedDed = earnedIncomeDeduction(gross);
    var earnedIncome = Math.max(0, gross - earnedDed);
    var personalDed = RATES.baseDeductionPerPerson * people;
    var insuranceDedYear = (pension + health + ltc) * 12; // 연금보험료 + 특별소득공제(건강보험료)
    var taxBase = Math.max(0, earnedIncome - personalDed - insuranceDedYear);

    var calcTax = calcTaxByBracket(taxBase);
    var credit = earnedCredit(calcTax, gross);
    var afterEarned = Math.max(0, calcTax - credit);
    var stdCredit = withStd ? Math.min(RATES.standardCredit, afterEarned) : 0;
    var taxYear = Math.max(0, afterEarned - stdCredit);
    var localYear = taxYear * RATES.localTaxRate;

    var incomeTaxMonthly = floorTo(taxYear / 12, 10);
    var localTaxMonthly = floorTo(localYear / 12, 10);
    var taxMonthly = incomeTaxMonthly + localTaxMonthly;

    var totalDeductionMonthly = insuranceMonthly + taxMonthly;
    var netMonthly = Math.max(0, monthlyGross - totalDeductionMonthly);

    return {
      gross: gross,
      monthlyGross: monthlyGross,
      dependents: people,
      pension: pension,
      health: health,
      ltc: ltc,
      employment: employment,
      insuranceMonthly: insuranceMonthly,
      insuranceYearly: insuranceMonthly * 12,
      earnedDeduction: earnedDed,
      earnedIncome: earnedIncome,
      personalDeduction: personalDed,
      insuranceDeduction: insuranceDedYear,
      taxBase: taxBase,
      marginalRate: wageBand(taxBase),
      calculatedTax: calcTax,
      earnedCredit: credit,
      standardCredit: stdCredit,
      incomeTaxYear: taxYear,
      localTaxYear: localYear,
      incomeTaxMonthly: incomeTaxMonthly,
      localTaxMonthly: localTaxMonthly,
      taxMonthly: taxMonthly,
      totalDeductionMonthly: totalDeductionMonthly,
      netMonthly: netMonthly,
      netYearly: netMonthly * 12,
      effectiveTaxRate: gross > 0 ? (taxYear + localYear) / gross : 0,
      totalDeductionRate: gross > 0 ? (totalDeductionMonthly * 12) / gross : 0,
      insuranceRate: gross > 0 ? (insuranceMonthly * 12) / gross : 0
    };
  }

  /**
   * 미국주식 배당·복리 계산
   * @param {object} o {initial, monthly, divYield, growth, years, fx, reinvest}
   *   금액 단위는 원, 이율은 % 단위
   */
  function calcDividend(o) {
    var initial = Math.max(0, Number(o.initial) || 0);
    var monthly = Math.max(0, Number(o.monthly) || 0);
    var divYield = clamp(Number(o.divYield) || 0, 0, 100) / 100;
    var growth = clamp(Number(o.growth) || 0, -100, 100) / 100;
    var years = clamp(Math.round(Number(o.years) || 1), 1, 60);
    var fx = clamp(Number(o.fx) || 1380, 100, 10000);
    var reinvest = o.reinvest !== false;

    var months = years * 12;
    var monthGrowth = growth / 12;
    var sharesValue = initial / fx;   // 투자 원금(달러)
    var cashUsd = 0;                  // 재투자하지 않은 배당금(달러)
    var totalNetDiv = 0;              // 누적 세후 배당(원)
    var totalGrossDiv = 0;            // 누적 세전 배당(원)
    var series = [];

    for (var m = 1; m <= months; m++) {
      sharesValue += monthly / fx;
      sharesValue *= (1 + monthGrowth);

      if (m % 12 === 0) {
        var grossDivUsd = sharesValue * divYield;
        var netDivUsd = grossDivUsd * (1 - RATES.dividendTax);
        if (reinvest) sharesValue += netDivUsd;
        else cashUsd += netDivUsd;

        totalNetDiv += netDivUsd * fx;
        totalGrossDiv += grossDivUsd * fx;

        var valueUsd = sharesValue + cashUsd;
        series.push({
          year: m / 12,
          valueKRW: valueUsd * fx,
          valueUSD: valueUsd,
          grossDivYearKRW: grossDivUsd * fx,
          netDivYearKRW: netDivUsd * fx,
          netDivMonthKRW: (netDivUsd * fx) / 12,
          principalKRW: initial + monthly * m
        });
      }
    }

    var last = series[series.length - 1] || {
      valueKRW: initial, valueUSD: initial / fx,
      grossDivYearKRW: 0, netDivYearKRW: 0, netDivMonthKRW: 0,
      principalKRW: initial
    };
    var principal = initial + monthly * months;
    var profit = last.valueKRW - principal;

    return {
      years: years,
      fx: fx,
      reinvest: reinvest,
      principal: principal,
      finalKRW: last.valueKRW,
      finalUSD: last.valueUSD,
      profit: profit,
      profitRate: principal > 0 ? profit / principal : 0,
      grossDivYear: last.grossDivYearKRW,
      netDivYear: last.netDivYearKRW,
      netDivMonth: last.netDivMonthKRW,
      netDivYield: last.valueKRW > 0 ? last.netDivYearKRW / last.valueKRW : 0,
      totalNetDividend: totalNetDiv,
      totalGrossDividend: totalGrossDiv,
      dividendTaxTotal: totalGrossDiv - totalNetDiv,
      series: series
    };
  }

  /* ── 표시용 서식 ───────────────────────────── */
  function won(num) {
    if (!isFinite(num)) return '—';
    return Math.round(num).toLocaleString('ko-KR') + '원';
  }

  function wonShort(num) {
    var n = Math.round(num);
    var abs = Math.abs(n);
    if (abs >= 100000000) {
      var eok = n / 100000000;
      var digits = Math.abs(eok) >= 10 ? 0 : 1;
      return eok.toFixed(digits).replace(/\.0$/, '') + '억원';
    }
    if (abs >= 10000) return Math.round(n / 10000).toLocaleString('ko-KR') + '만원';
    return n.toLocaleString('ko-KR') + '원';
  }

  function usd(num) {
    if (!isFinite(num)) return '—';
    return '$' + Math.round(num).toLocaleString('en-US');
  }

  function pct(num, digits) {
    if (!isFinite(num)) return '—';
    var d = typeof digits === 'number' ? digits : 2;
    return (num * 100).toFixed(d).replace(/\.0+$/, '') + '%';
  }

  function number(num) {
    return Math.round(num).toLocaleString('ko-KR');
  }

  global.FinanceTool = {
    RATES: RATES,
    TAX_BRACKETS: TAX_BRACKETS,
    calcSalary: calcSalary,
    calcDividend: calcDividend,
    earnedIncomeDeduction: earnedIncomeDeduction,
    calcTaxByBracket: calcTaxByBracket,
    earnedCreditLimit: earnedCreditLimit,
    fmt: { won: won, wonShort: wonShort, usd: usd, pct: pct, number: number }
  };
})(typeof window !== 'undefined' ? window : this);
