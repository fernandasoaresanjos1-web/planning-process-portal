// testa direto a API Acessórias para ver o que retorna
const TOKEN = 'ef7ceb75e9bab0fe36832dccc68e0e3c';

async function teste() {
  const urls = [
    'https://api.acessorias.com/tags/ListAll',
    'https://api.acessorias.com/tags/ListAll?Pagina=1',
    'https://api.acessorias.com/tags/ListAll?companies&Pagina=1',
    'https://api.acessorias.com/tags/1',
  ];
  
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
      const text = await r.text();
      console.log('\n' + url.split('acessorias.com')[1]);
      console.log('Status:', r.status);
      console.log('Resposta:', text.substring(0, 200));
    } catch(e) {
      console.log('Erro:', e.message);
    }
  }
}

teste();
