import { describe, expect, it } from 'vitest';
import { toSkuListViewProps } from '../lib/mgr/sku-list-view';
import { toCatalogViewProps } from '../lib/mgr/catalog-view';

describe('pours in the sellable SKU catalog', () => {
  const pour = { id: 'pour-id', name: 'Pint', ounces: 16 };
  it('puts a pour alongside packaged SKUs without inventing stock volume', () => {
    const view = toSkuListViewProps({ brand: { id: 'brand', name: 'Lupula' }, skus: [], pours: [pour] });
    expect(view.empty).toBeUndefined();
    expect(view.rows).toEqual([expect.objectContaining({ key: 'pour:pour-id', title: 'Pint', kind: 'poured', detail: '16 oz · pour · drawn from keg' })]);
    expect(view.rows[0].detail).not.toContain('bbl');
  });
  it('counts persisted packages including inactive SKUs, separately from poured serving identities', () => {
    const skus = [
      { id: 'active-case', name: 'Lupula case', active: true, format_id: 'case', formats: { name: 'Case', bbl_per_unit: 0.1 } },
      { id: 'inactive-half', name: 'Lupula half', active: false, format_id: 'half', formats: { name: 'Half', bbl_per_unit: 0.5 } },
    ];
    const brand = { id: 'brand', name: 'Lupula', abv: 7, styles: null, skus, pours: [pour], colas: [] };
    const view = toCatalogViewProps({ brands: [brand], priceGroups: [] });
    expect(view.brands.map(({ key, skus }) => ({ key, skus }))).toEqual([{ key: 'brand', skus: '2' }]);
    const list = toSkuListViewProps({ brand, skus, pours: [pour] });
    expect(list.rows.map(row => row.key)).toEqual(['active-case', 'inactive-half', 'pour:pour-id']);
    expect(list.rows[0].detail).toContain('active');
    expect(list.rows[1].detail).toContain('inactive');
    expect(list.rows[2]).toMatchObject({ key: 'pour:pour-id', kind: 'poured' });
    expect(toCatalogViewProps({ brands: [{ ...brand, skus: [] }], priceGroups: [] }).brands[0].skus).toBe('0');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pourSkuName, skuCreateCommand, toSkuViewProps } from '../lib/mgr/sku-view';
import { SkuView } from '../components/mgr/views/sku';
it('New SKU creates a packaged SKU only; pours are added on the price group', () => {
  expect(skuCreateCommand({ brandId:'brand', formatId:'case', name:'Case', upc:'123' })).toEqual({ name:'create_sku', input:{brandId:'brand',formatId:'case',name:'Case',upc:'123'}, valid:true });
  expect(skuCreateCommand({ brandId:'brand', formatId:'', name:'', upc:'' }).valid).toBe(false);
  const html = renderToStaticMarkup(createElement(SkuView, { model: toSkuViewProps({ formats: [{ id:'case', name:'Case' }] }) }));
  expect(html).toContain('Format');
  expect(html).not.toContain('>Type<');
});
it('suggests a pour name from serving size when no custom name is supplied', () => {
  expect(pourSkuName('', '16')).toBe('16 oz pour');
  expect(pourSkuName(' Pint ', '16')).toBe('Pint');
});
