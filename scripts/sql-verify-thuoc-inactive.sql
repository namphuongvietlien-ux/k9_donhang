select count(*)::int as thuoc_inactive
from public.products
where category_group = 'THUOC' and is_active = false;

select slug, name, is_active
from public.products
where category_group = 'THUOC' and is_active = false
order by slug
limit 80;

select category_group, count(*)::int as n
from public.products
group by 1
order by 2 desc;
