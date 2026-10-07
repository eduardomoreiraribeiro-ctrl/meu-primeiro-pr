// Cálculos da avaliação física (sem tela): IMC, relação cintura-quadril,
// soma de dobras, densidade corporal e % de gordura (equação de Siri).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.avaliacao = (function () {
  const CIRCUNFERENCIAS = {
    bracoRelaxado: 'Braço relaxado',
    bracoContraido: 'Braço contraído',
    torax: 'Tórax',
    cintura: 'Cintura',
    abdome: 'Abdome',
    quadril: 'Quadril',
    coxa: 'Coxa',
    panturrilha: 'Panturrilha',
  };

  const DOBRAS = {
    tricipital: 'Tricipital',
    bicipital: 'Bicipital',
    subescapular: 'Subescapular',
    peitoral: 'Peitoral',
    axilarMedia: 'Axilar média',
    suprailiaca: 'Suprailíaca',
    abdominal: 'Abdominal',
    coxa: 'Coxa',
    panturrilha: 'Panturrilha',
  };

  const METODOS = {
    bioimpedancia: 'Bioimpedância',
    dobras: 'Dobras cutâneas',
    outro: 'Outro método',
  };

  // Dobras usadas por cada fórmula (a de 3 dobras muda com o sexo).
  const FORMULAS = {
    jp7: {
      nome: 'Jackson & Pollock — 7 dobras',
      dobras: () => ['peitoral', 'axilarMedia', 'tricipital', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'],
    },
    jp3: {
      nome: 'Jackson & Pollock — 3 dobras',
      dobras: (sexo) => (sexo === 'M' ? ['peitoral', 'abdominal', 'coxa'] : ['tricipital', 'suprailiaca', 'coxa']),
    },
    durnin: {
      nome: 'Durnin & Womersley — 4 dobras',
      dobras: () => ['bicipital', 'tricipital', 'subescapular', 'suprailiaca'],
    },
  };

  // Durnin & Womersley (1974): D = c − m · log10(soma), por sexo e faixa de idade.
  const DURNIN = {
    M: [[19, 1.1620, 0.0630], [29, 1.1631, 0.0632], [39, 1.1422, 0.0544], [49, 1.1620, 0.0700], [Infinity, 1.1715, 0.0779]],
    F: [[19, 1.1549, 0.0678], [29, 1.1599, 0.0717], [39, 1.1423, 0.0632], [49, 1.1333, 0.0612], [Infinity, 1.1339, 0.0645]],
  };

  const arred = (n, casas = 1) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10 ** casas) / 10 ** casas);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

  function imc(pesoKg, alturaCm) {
    if (!num(pesoKg) || !num(alturaCm)) return null;
    const m = alturaCm / 100;
    return arred(pesoKg / (m * m));
  }

  /** Faixa do IMC (adultos, OMS). */
  function classificarImc(valor) {
    if (valor === null) return '';
    if (valor < 18.5) return 'abaixo do peso';
    if (valor < 25) return 'peso adequado';
    if (valor < 30) return 'sobrepeso';
    if (valor < 35) return 'obesidade grau I';
    if (valor < 40) return 'obesidade grau II';
    return 'obesidade grau III';
  }

  function relacaoCinturaQuadril(circ = {}) {
    if (!num(circ.cintura) || !num(circ.quadril)) return null;
    return arred(circ.cintura / circ.quadril, 2);
  }

  function somaDobras(dobras = {}) {
    const valores = Object.values(dobras).filter(num);
    return valores.length ? arred(valores.reduce((t, v) => t + v, 0)) : null;
  }

  /**
   * Densidade corporal pela fórmula. Devolve { densidade } ou { erro } explicando o que falta.
   */
  function densidade(formula, dobras, sexo, idade) {
    const f = FORMULAS[formula];
    if (!f) return { erro: 'Escolha a fórmula.' };
    if (sexo !== 'M' && sexo !== 'F') return { erro: 'Informe o sexo no cadastro para calcular o % de gordura.' };
    if (!num(idade)) return { erro: 'Informe a data de nascimento no cadastro para calcular o % de gordura.' };
    const necessarias = f.dobras(sexo);
    const faltando = necessarias.filter((d) => !num(dobras?.[d]));
    if (faltando.length) return { erro: `Faltam as dobras: ${faltando.map((d) => DOBRAS[d].toLowerCase()).join(', ')}.` };
    const s = necessarias.reduce((t, d) => t + dobras[d], 0);

    let d;
    if (formula === 'jp7') {
      d = sexo === 'M'
        ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * idade
        : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * idade;
    } else if (formula === 'jp3') {
      d = sexo === 'M'
        ? 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * idade
        : 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * idade;
    } else {
      const [, c, m] = DURNIN[sexo].find(([ate]) => idade <= ate);
      d = c - m * Math.log10(s);
    }
    return { densidade: d, soma: s };
  }

  /** Equação de Siri: % de gordura a partir da densidade. */
  const siri = (d) => (4.95 / d - 4.5) * 100;

  /**
   * Resultado completo de uma avaliação.
   * av: { pesoKg, alturaCm, metodo, formula, percentualGordura (manual), circunferencias, dobras }
   * pessoa: { sexo, idade }
   */
  function calcular(av, pessoa = {}) {
    const r = {
      imc: imc(av.pesoKg, av.alturaCm),
      rcq: relacaoCinturaQuadril(av.circunferencias),
      somaDobras: somaDobras(av.dobras),
      percentualGordura: null,
      origemPercentual: null,
      erroPercentual: null,
    };
    r.classificacaoImc = classificarImc(r.imc);

    if (av.metodo === 'dobras') {
      const d = densidade(av.formula, av.dobras, pessoa.sexo, pessoa.idade);
      if (d.erro) r.erroPercentual = d.erro;
      else {
        r.percentualGordura = arred(siri(d.densidade));
        r.densidade = arred(d.densidade, 4);
        r.origemPercentual = FORMULAS[av.formula].nome;
      }
    } else if (num(av.percentualGordura)) {
      r.percentualGordura = arred(av.percentualGordura);
      r.origemPercentual = METODOS[av.metodo] || 'informado';
    }

    if (r.percentualGordura !== null && num(av.pesoKg)) {
      r.massaGorda = arred((av.pesoKg * r.percentualGordura) / 100);
      r.massaMagra = arred(av.pesoKg - r.massaGorda);
    } else {
      r.massaGorda = null;
      r.massaMagra = null;
    }
    return r;
  }

  return {
    CIRCUNFERENCIAS, DOBRAS, METODOS, FORMULAS,
    imc, classificarImc, relacaoCinturaQuadril, somaDobras, densidade, siri, calcular,
  };
})();
