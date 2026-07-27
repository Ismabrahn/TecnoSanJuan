import budgetRequest from './schemas/budget-request.json' assert { type: 'json' };
import impresion3d from './schemas/impresion_3d.json' assert { type: 'json' };
import printOrder from './schemas/print-order.json' assert { type: 'json' };
import repairRequest from './schemas/repair-request.json' assert { type: 'json' };
import metaSchema from './interview.meta-schema.json' assert { type: 'json' };

export const BUILT_IN_SCHEMAS = {
  budget_request: budgetRequest,
  impresion_3d: impresion3d,
  print_order: printOrder,
  repair_request: repairRequest,
};

export const META_SCHEMA = metaSchema;
