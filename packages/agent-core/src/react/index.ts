/**
 * ReAct and CoAct Frameworks
 * Exports for ReAct (Reason + Act) and CoAct (Coordinated Act) prompting frameworks
 */

export { ReActProcessor } from "./react-processor";
export { CoActProcessor, type CoActStreamPart } from "./coact-processor";
export { ProcessorFactory } from "./processor-factory";
export {
  REACT_XML_TAGS,
  MAX_REACT_ITERATIONS,
  REACT_SYSTEM_PROMPT_TEMPLATE,
} from "./config";
export { extractXmlTagContent, parseReactToolCall } from "./xml-parser";
export type {
  ParsedReactToolCall,
  ReactObservation,
  ToolExecutor,
} from "./types";
