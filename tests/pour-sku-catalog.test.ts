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
  it('counts pours without adding another brand row', () => {
    const view = toCatalogViewProps({ brands: [{ id:'brand', name:'Lupula', abv:7, styles:null, skus:[{id:'case'}], pours:[pour] }], priceGroups:[] });
    expect(view.brands).toHaveLength(1);
    expect(view.brands[0].detail).toContain('2 SKUs');
  });
});

import { skuCreateCommand } from '../lib/mgr/sku-view';
it('routes pour creation to the serving command and excludes stock fields', () => {
  const fields = { brandId:'brand', kind:'poured' as const, pourName:'Pint', ounces:'16', formatId:'case', name:'Case', upc:'123' };
  expect(skuCreateCommand(fields)).toEqual({ name:'upsert_format', input:{brandId:'brand',basis:'poured',name:'Pint',ounces:16}, valid:true });
  expect(skuCreateCommand({...fields, ounces:'0'}).valid).toBe(false);
  expect(skuCreateCommand({...fields, ounces:'1000'}).valid).toBe(false);
  expect(skuCreateCommand({...fields, ounces:'Infinity'}).valid).toBe(false);
  expect(skuCreateCommand({...fields, kind:'packaged'}).input).toEqual({brandId:'brand',formatId:'case',name:'Case',upc:'123'});
});
it('suggests a pour name from serving size when no custom name is supplied', () => {
  const result = skuCreateCommand({ brandId:'brand', kind:'poured', pourName:'', ounces:'16', formatId:'', name:'', upc:'' });
  expect(result.input).toMatchObject({name:'16 oz pour',ounces:16});
  expect(result.valid).toBe(true);
});
