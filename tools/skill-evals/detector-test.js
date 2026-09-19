const VISUAL_TERM = /(mockup|wireframe|prot[oó]tipo|visual companion|companion visual|preview|pr[eé]-?visualiza|esbo[cç]o|tela de exemplo|maquete)/i;
const OFFER_MARK = /(quer que|gostaria|posso (montar|fazer|preparar|gerar|criar)|te mostr|lhe mostr|mostrar para voc|want me|shall i|i can put together|montar (um|uma)|prefere)/i;
const split = t => t.split(/(?<=[.!?…])\s+|\n{2,}|\n(?=[-*>#])/).filter(Boolean);
function detect(text) {
  const s = split(text);
  for (let i = 0; i < s.length; i++) {
    const win = (s[i] + ' ' + (s[i+1] || '')).trim();
    if (VISUAL_TERM.test(win) && OFFER_MARK.test(win)) return true;
  }
  return false;
}
const positivos = [
  'Essa parte fica mais fácil se eu mostrar: posso montar um mockup rápido da tela para você aprovar. Quer que eu faça?',
  'Antes de detalhar, quer que eu monte um protótipo navegável das três telas?',
  'This next part might be easier if I show you — I can put together a quick mockup for you to look at. Want me to?',
  'Posso preparar um esboço da disposição dos cards no dashboard, se preferir ver antes de decidir.',
  'Gostaria de ver um wireframe da tela antes de eu escrever a spec?',
  'Uma coisa antes das perguntas. Posso montar um mockup da tela. Quer ver?'
];
const negativos = [
  'Vamos discutir o layout da tela e os campos necessários.',
  'A tela de cadastro terá validação de CNPJ.',
  'Classifiquei como arquitetural: o caminho é spec escrita e depois writing-plans.',
  'Vou seguir os padrões visuais existentes em src/components.',
  'O relatório impresso precisa de cabeçalho e totalizadores.',
  'Quer que eu comece pelo endpoint de consulta? A validação fica na camada de serviço.'
];
let ok=0,bad=0;
console.log('--- devem ser DETECTADOS ---');
positivos.forEach(t=>{const d=detect(t);console.log((d?'  OK   ':'  FALHA ')+t.slice(0,68));d?ok++:bad++;});
console.log('--- NAO devem ser detectados ---');
negativos.forEach(t=>{const d=detect(t);console.log((!d?'  OK   ':'  FALHA ')+t.slice(0,68));!d?ok++:bad++;});
console.log('\ndetector: '+ok+'/'+(ok+bad)+' corretos');
