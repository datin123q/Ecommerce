import { applySoftDeleteFilters } from './soft-delete.helpers';

describe('applySoftDeleteFilters', () => {
  it('filters soft-deletable models and nested relations', () => {
    const args = {
      where: { id: 'category-1' },
      include: {
        products: {
          where: { isActive: true },
          include: { variants: true },
        },
      },
    };

    applySoftDeleteFilters('Category', args);

    expect(args).toEqual({
      where: { id: 'category-1', deletedAt: null },
      include: {
        products: {
          where: { isActive: true, deletedAt: null },
          include: {
            variants: { where: { deletedAt: null } },
          },
        },
      },
    });
  });

  it('does not add deletedAt filters to relations without soft delete', () => {
    const args = { include: { inventories: true } };

    applySoftDeleteFilters('Warehouse', args);

    expect(args.include.inventories).toBe(true);
  });
});
