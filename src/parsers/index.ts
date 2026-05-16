import { ParserRegistry } from './registry';
import { HDFCParser } from './hdfc/hdfc.parser';
import { SBIParser } from './sbi/sbi.parser';
import { ChaseParser } from './chase/chase.parser';

export function createParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  registry.register(new HDFCParser());
  registry.register(new SBIParser());
  registry.register(new ChaseParser());
  return registry;
}

export { ParserRegistry } from './registry';
export { HDFCParser } from './hdfc/hdfc.parser';
export { SBIParser } from './sbi/sbi.parser';
export { ChaseParser } from './chase/chase.parser';
