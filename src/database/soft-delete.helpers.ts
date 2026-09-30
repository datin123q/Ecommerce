const SOFT_DELETE_MODELS = [
  'User',
  'Product',
  'ProductVariant',
  'Category',
  'Warehouse',
  'Voucher',
] as const;

type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];
type QueryRecord = Record<string, unknown>;
type RelationDefinition = {
  model: string;
  isMany: boolean;
};

const SOFT_DELETE_RELATIONS: Record<
  string,
  Record<string, RelationDefinition>
> = {
  Product: {
    variants: { model: 'ProductVariant', isMany: true },
  },
  Category: {
    products: { model: 'Product', isMany: true },
  },
  Warehouse: {
    inventories: { model: 'Inventory', isMany: true },
  },
};

export interface SoftDeleteQueryArgs {
  where?: unknown;
  include?: unknown;
}

function isRecord(value: unknown): value is QueryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel);
}

function addRelationFilters(parentModel: string, include: QueryRecord): void {
  const relations = SOFT_DELETE_RELATIONS[parentModel] ?? {};

  for (const [relationName, relation] of Object.entries(relations)) {
    const value = include[relationName];
    const targetIsSoftDeletable = isSoftDeleteModel(relation.model);

    if (value === true) {
      if (targetIsSoftDeletable && relation.isMany) {
        include[relationName] = { where: { deletedAt: null } };
      }
      continue;
    }

    if (!isRecord(value)) continue;

    if (targetIsSoftDeletable && relation.isMany) {
      value.where = {
        ...(isRecord(value.where) ? value.where : {}),
        deletedAt: null,
      };
    }

    if (isRecord(value.include)) {
      addRelationFilters(relation.model, value.include);
    }
  }
}

export function applySoftDeleteFilters(
  model: string,
  args: SoftDeleteQueryArgs,
): void {
  if (isSoftDeleteModel(model)) {
    args.where = {
      ...(isRecord(args.where) ? args.where : {}),
      deletedAt: null,
    };
  }

  if (isRecord(args.include)) {
    addRelationFilters(model, args.include);
  }
}
