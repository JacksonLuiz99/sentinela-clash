const token = process.env.CLASH_API_TOKEN;
if (!token) {
  console.error('Preencha CLASH_API_TOKEN no arquivo local .dev.vars e execute novamente. A chave não será exibida.');
  process.exit(1);
}
try {
  const response = await fetch('https://cocproxy.royaleapi.dev/v1/clans/%23R0UPVVVY', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    console.error(`Conexão recusada (HTTP ${response.status}). Confira a chave e o IP autorizado 45.79.218.79.`);
    process.exitCode = 1;
  } else {
    const clan = await response.json();
    if (clan.tag !== '#R0UPVVVY') throw new Error('clan');
    console.log(`Conectado: ${clan.name} (${clan.tag}), ${clan.members} membros. Registro de guerra: ${clan.isWarLogPublic ? 'público' : 'privado'}.`);
  }
} catch {
  console.error('Não foi possível consultar o proxy. Verifique a rede e tente novamente.');
  process.exitCode = 1;
}
