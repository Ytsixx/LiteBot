import fs from 'fs-extra';
global.config = {}
const {
  version, author, repository, type
} = await fs.readJson('./package.json'); 
config.info = {
  botNome: 'Base LiteBot '+version,
  botPrefix: '.',
  botVersao: version,
  botType: type
}