// E-mails automáticos para os pacientes (e o resumo do dia para o profissional).
// Mesmo jeito de falar das mensagens do WhatsApp; usado pelo servidor e pela prévia no sistema.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.mensagensEmail = (function () {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const genero = (texto, pessoa) => (NutriDudu.mensagensAutomaticas?.paraGenero ? NutriDudu.mensagensAutomaticas.paraGenero(texto, pessoa) : texto);

  const TIPOS = {
    lembrete: 'Lembrete de consulta',
    preAnamnese: 'Pré-anamnese',
    checkin: 'Check-in',
    checkinLembrete: 'Lembrete do check-in',
    aniversario: 'Aniversário',
    resumoDia: 'Resumo do dia (para você)',
  };

  /** Moldura do e-mail: cartão branco, nome do profissional, botão verde opcional e rodapé. */
  function moldura({ paragrafos, botao = null, assinatura, rodape = true }) {
    const corpo = paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#17211b">${p}</p>`).join('');
    const btn = botao ? `<p style="margin:22px 0"><a href="${esc(botao.link)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:13px 22px;border-radius:10px">${esc(botao.texto)}</a></p>
      <p style="margin:0 0 14px;font-size:13px;color:#55625b">Se o botão não abrir, copie este endereço: <br><a href="${esc(botao.link)}" style="color:#15803d;word-break:break-all">${esc(botao.link)}</a></p>` : '';
    return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px 12px;background:#eef3f0;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #dce3df">
        ${corpo}${btn}
        <p style="margin:22px 0 0;font-size:15px;color:#17211b"><strong>${esc(assinatura)}</strong></p>
      </div>
      ${rodape ? '<p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#55625b;text-align:center">Não quer mais receber esses e-mails? É só responder "parar".</p>' : ''}
    </body></html>`;
  }

  /** Texto simples (para quem não vê HTML). */
  const simples = (linhas, botao) => [...linhas, ...(botao ? ['', `${botao.texto}: ${botao.link}`] : [])].join('\n\n');

  /**
   * Monta um e-mail. tipo: lembrete | preAnamnese | checkin | checkinLembrete | aniversario | resumoDia
   * d: { nome, pessoa, assinatura, dia, hora, quando, linkOnline, link, titulo, prazo, resumo }
   */
  function montar(tipo, d) {
    const p = d.pessoa || {};
    const g = (t) => genero(t, p);
    const assinatura = d.assinatura || 'Eduardo Ribeiro – Nutricionista';
    let assunto; let linhas; let botao = null;
    if (tipo === 'lembrete') {
      assunto = `Lembrete: sua consulta ${d.dia} às ${d.hora}`;
      linhas = [g(`Oi, ${d.nome}! Tudo bem? 😊`), `Passando pra lembrar da nossa consulta ${d.dia}, às ${d.hora}.${d.linkOnline ? ` A consulta é online, por esse link: ${d.linkOnline}` : ''}`, 'Consegue confirmar? É só responder este e-mail.'];
    } else if (tipo === 'preAnamnese') {
      assunto = 'Antes da nossa primeira consulta: sua pré-anamnese';
      linhas = [g(`Oi, ${d.nome}! Que bom que você vai começar comigo 💚`), `Pra nossa consulta de ${d.quando} render ao máximo, preenche esse formulário rapidinho (uns 5 minutos).`, 'Só eu vejo suas respostas, tá?'];
      botao = { texto: 'Preencher agora', link: d.link };
    } else if (tipo === 'checkin') {
      assunto = `Seu ${d.titulo} tá disponível 📋`;
      linhas = [g(`Oi, ${d.nome}! Seu ${d.titulo} tá disponível 😊`), 'Responde rapidinho, leva uns 2 minutos.', `Vale até ${d.prazo}, tá?`];
      botao = { texto: 'Responder check-in', link: d.link };
    } else if (tipo === 'checkinLembrete') {
      assunto = 'Último dia pra responder seu check-in ⏰';
      linhas = [`Oi, ${d.nome}! Passando pra lembrar do seu ${d.titulo}: o prazo termina hoje ⏰`, g('Leva só 2 minutinhos e me ajuda muito a acompanhar sua evolução 💚')];
      botao = { texto: 'Responder agora', link: d.link };
    } else if (tipo === 'aniversario') {
      assunto = `Feliz aniversário, ${d.nome}! 🎉`;
      linhas = [`Oi, ${d.nome}! Hoje é o seu dia! 🎉`, g('Feliz aniversário! Que esse novo ciclo venha com muita saúde, energia e conquistas. Conta sempre comigo 💚')];
    } else if (tipo === 'resumoDia') {
      assunto = `Resumo de ${d.dia}`;
      const html = moldura({ paragrafos: String(d.resumo || '').split('\n').map((l) => (l.trim() ? esc(l) : '&nbsp;')), assinatura: 'Sistema Nutri Dudu', rodape: false })
        .replace(/margin:0 0 14px;font-size:16px/g, 'margin:0 0 4px;font-size:15px');
      return { assunto, html, texto: String(d.resumo || '') };
    } else {
      throw new Error(`Tipo de e-mail desconhecido: ${tipo}`);
    }
    return { assunto, html: moldura({ paragrafos: linhas.map(esc), botao, assinatura }), texto: simples(linhas, botao) };
  }

  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

  return { TIPOS, montar, emailValido };
})();
