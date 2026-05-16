import { ParserRegistry } from './registry';
import { HDFCParser } from './hdfc/hdfc.parser';
import { SBIParser } from './sbi/sbi.parser';
import { ChaseParser } from './chase/chase.parser';
import { GenericParser } from './generic/generic.parser';

export function createParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  // Specific parsers registered first (higher confidence scores)
  registry.register(new HDFCParser());
  registry.register(new SBIParser());
  registry.register(new ChaseParser());
  // Generic fallback always registered last (lowest confidence: 0.10)
  registry.register(new GenericParser());
  return registry;
}

export { ParserRegistry } from './registry';
export { HDFCParser } from './hdfc/hdfc.parser';
export { SBIParser } from './sbi/sbi.parser';
export { ChaseParser } from './chase/chase.parser';
export { GenericParser } from './generic/generic.parser';
