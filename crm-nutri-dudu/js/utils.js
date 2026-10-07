// Funções auxiliares de formatação e cálculo.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.utils = (function () {
  const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const horaFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const diaSemanaFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const MS_DIA = 24 * 60 * 60 * 1000;

  function uid(prefixo) {
    const aleatorio = Math.random().toString(36).slice(2, 8);
    return `${prefixo}_${Date.now().toString(36)}${aleatorio}`;
  }

  function moeda(valor) {
    return moedaFmt.format(Number(valor) || 0);
  }

  // Datas sem horário ("2026-10-07") são tratadas como data local, não UTC.
  function paraData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [a, m, d] = valor.split('-').map(Number);
      return new Date(a, m - 1, d);
    }
    return new Date(valor);
  }

  function data(valor) {
    const d = paraData(valor);
    return d ? dataFmt.format(d) : '—';
  }

  function hora(valor) {
    const d = paraData(valor);
    return d ? horaFmt.format(d) : '—';
  }

  function diaPorExtenso(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    const texto = diaSemanaFmt.format(d);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // "2026-10-07" no fuso local.
  function isoDia(valor) {
    const d = paraData(valor);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function inicioDoDia(valor) {
    const d = new Date(paraData(valor));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Dias inteiros de calendário entre duas datas (b − a).
  function diasEntre(a, b) {
    return Math.round((inicioDoDia(b) - inicioDoDia(a)) / MS_DIA);
  }

  function idade(dataNascimento) {
    const nasc = paraData(dataNascimento);
    if (!nasc) return null;
    const hoje = new Date();
    let anos = hoje.getFullYear() - nasc.getFullYear();
    const antesDoAniversario =
      hoje.getMonth() < nasc.getMonth() ||
      (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate());
    if (antesDoAniversario) anos--;
    return anos;
  }

  function imc(pesoKg, alturaCm) {
    if (!pesoKg || !alturaCm) return null;
    const m = alturaCm / 100;
    return Math.round((pesoKg / (m * m)) * 10) / 10;
  }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toUpperCase();
  }

  function escapeHtml(texto) {
    return String(texto ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Busca sem diferenciar maiúsculas nem acentos.
  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function soDigitos(texto) {
    return String(texto || '').replace(/\D/g, '');
  }

  // (11) 91234-5678 / (11) 1234-5678, formatando enquanto a pessoa digita.
  function formatarTelefone(valor) {
    const d = soDigitos(valor).slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  // "1 dia", "3 dias".
  /** "hoje" ou "há N dia(s)". */
  const haDias = (n) => (n === 0 ? 'hoje' : `há ${dias(n)}`);

  /** R$ compacto para gráficos: R$ 950, R$ 1,8 mil. */
  function moedaCurta(v) {
    if (Math.abs(v) < 1000) return `R$ ${Math.round(v)}`;
    return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }

  function dias(n) {
    return `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
  }

  function telefoneValido(valor) {
    const d = soDigitos(valor);
    return d.length === 10 || d.length === 11;
  }

  function formatarCpf(valor) {
    const d = soDigitos(valor).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  // Confere os dois dígitos verificadores do CPF.
  function cpfValido(valor) {
    const d = soDigitos(valor);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const digito = (base) => {
      const soma = [...base].reduce((t, n, i) => t + Number(n) * (base.length + 1 - i), 0);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digito(d.slice(0, 9)) === Number(d[9]) && digito(d.slice(0, 10)) === Number(d[10]);
  }

  function emailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || '').trim());
  }

  return {
    haDias, moedaCurta,
    dias, formatarTelefone, telefoneValido, formatarCpf, cpfValido, emailValido,
    uid, moeda, paraData, data, hora, diaPorExtenso, isoDia, inicioDoDia, diasEntre,
    idade, imc, iniciais, escapeHtml, normalizar, soDigitos,
  };
})();
