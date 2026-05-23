import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const audit = require('./index.js');

export default audit;
export const AUDIT_JSON_SCHEMA = audit.AUDIT_JSON_SCHEMA;
export const createAuditReport = audit.createAuditReport;
export const loadAuditConfig = audit.loadAuditConfig;
export const parseTokenSources = audit.parseTokenSources;
export const toAuditContractReport = audit.toAuditContractReport;
