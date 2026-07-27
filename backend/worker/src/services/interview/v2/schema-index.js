import budgetRequest from "./schemas/budget-request.json" with { type: "json" };
import impresion3d from "./schemas/impresion_3d.json" with { type: "json" };
import printOrder from "./schemas/print-order.json" with { type: "json" };
import repairRequest from "./schemas/repair-request.json" with { type: "json" };
import metaSchema from "./interview.meta-schema.json" with { type: "json" };

export const BUILT_IN_SCHEMAS = {
  budget_request: budgetRequest,
  impresion_3d: impresion3d,
  print_order: printOrder,
  repair_request: repairRequest,
};

export const META_SCHEMA = metaSchema;
