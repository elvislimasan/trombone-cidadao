import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedOperationalShell, operationalLoginPath, operationalRedirect } from '../lib/operationalAccess.js';
import { resolveLoginDestination, hasMunicipalityPanelAccess } from '../lib/municipalityAccess.js';
const driver={id:'driver',tipo_conta:'prefeitura',app_metadata:{pipa_driver:true}};
test('todas as telas do pipeiro ficam isoladas dos mapas, menus e perfil de cidadão',()=>{
  for(const path of ['/operacao-pipa/pipeiro','/operacao-pipa/pipeiro/mapa','/operacao-pipa/pipeiro/rotas','/operacao-pipa/pipeiro/historico','/operacao-pipa/pipeiro/senha']){
    assert.equal(isolatedOperationalShell(driver,path),true,path);assert.equal(operationalRedirect(driver,path),null);
  }
  for(const path of ['/mapa','/feed','/perfil','/prefeitura/operacao-pipa/mapa','/patrulhar','/completar-cadastro'])assert.equal(operationalRedirect(driver,path),'/operacao-pipa/pipeiro');
  assert.equal(operationalRedirect(driver,'/alterar-senha'),'/operacao-pipa/pipeiro/senha');
  assert.equal(hasMunicipalityPanelAccess(driver),false,'Pipeiro não herda o painel de gestão');
});
test('logins operacionais e retorno após autenticar preservam o tipo da conta',()=>{
  assert.equal(operationalLoginPath('/operacao-pipa/pipeiro/mapa'),'/operacao-pipa/login');
  assert.equal(operationalLoginPath('/prefeitura/operacao-pipa/rotas'),'/prefeitura/login');
  assert.equal(operationalLoginPath('/perfil'),'/login');
  assert.equal(resolveLoginDestination(driver,'/mapa'),'/operacao-pipa/pipeiro');
  assert.equal(resolveLoginDestination(driver,'/operacao-pipa/pipeiro/mapa?rota=123'),'/operacao-pipa/pipeiro/mapa?rota=123');
  assert.equal(resolveLoginDestination({id:'citizen'},'/operacao-pipa/pipeiro/mapa'),'/feed');
  assert.equal(operationalRedirect({has_municipality_access:true},'/operacao-pipa/pipeiro/mapa'),'/prefeitura/visao-geral');
  assert.equal(operationalRedirect(null,'/operacao-pipa/pipeiro/mapa'),null);
});
test('troca de senha e termos da prefeitura não exibem navegação do cidadão',()=>{
  for(const path of ['/alterar-senha','/termos-de-uso'])assert.equal(isolatedOperationalShell({has_municipality_access:true},path),true);
  assert.equal(isolatedOperationalShell({},'/mapa'),false);
  assert.equal(isolatedOperationalShell(null,'/operacao-pipa/login'),true);
});
