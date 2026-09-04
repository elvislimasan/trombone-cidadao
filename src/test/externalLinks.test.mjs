import test from 'node:test';
import assert from 'node:assert/strict';

import { linkEhDoYoutube, normalizarLinkExterno, textoDoBotaoExterno } from '../lib/externalLinks.js';

test('acrescenta https a um endereço digitado sem protocolo', () => {
  assert.equal(
    normalizarLinkExterno('youtube.com/@trombone'),
    'https://youtube.com/@trombone'
  );
});

test('aceita links http e https e recusa protocolos inseguros', () => {
  assert.equal(normalizarLinkExterno('https://prefeitura.gov.br/alerta'), 'https://prefeitura.gov.br/alerta');
  assert.equal(normalizarLinkExterno('ftp://arquivos.exemplo.com/alerta'), null);
  assert.equal(normalizarLinkExterno('data:text/html,teste'), null);
});

test('reconhece canais e vídeos do YouTube sem confundir domínios parecidos', () => {
  assert.equal(linkEhDoYoutube('https://www.youtube.com/@cidade'), true);
  assert.equal(linkEhDoYoutube('youtu.be/abc123'), true);
  assert.equal(linkEhDoYoutube('https://youtube.com.exemplo.com/video'), false);
});

test('usa texto personalizado e mantém um padrão quando ele está vazio', () => {
  assert.equal(textoDoBotaoExterno('  Assistir à transmissão  ', 'https://youtube.com/live/abc'), 'Assistir à transmissão');
  assert.equal(textoDoBotaoExterno('', 'https://youtube.com/@cidade'), 'Abrir no YouTube');
  assert.equal(textoDoBotaoExterno(null, 'https://prefeitura.gov.br/alerta'), 'Acessar mais informações');
});
