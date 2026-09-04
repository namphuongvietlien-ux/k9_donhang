select category_group, count(*)::int as n
from public.products
group by 1
order by 2 desc;

select count(*) filter (where is_active = false)::int as hidden_inactive
from public.products;

select slug, name, category_group, is_active
from public.products
where slug in (
  'CĐTTGV1007',
  'HĐTHTR2012',
  'IT13V01',
  'IT23V01',
  'IT23V02',
  'MTH1001',
  '000724',
  'ĐT001-1',
  'HVTCON0000'
)
order by slug;
