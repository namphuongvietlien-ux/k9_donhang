SELECT o.order_code, o.created_at, oi.product_slug, oi.price, oi.quantity, oi.is_gift, oi.line_notes
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE oi.product_slug IN ('CTPCHI1059','CTPCHI1060','CTPCHI1061','CTKMTK1005')
  AND o.created_at > now() - interval '2 days'
ORDER BY o.created_at DESC, oi.stt
LIMIT 40;
