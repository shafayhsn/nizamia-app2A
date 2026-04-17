-- Repair imported orders by rebuilding PO Matrix tables from grouped JSON source-- Run this only if the orders were imported into orders table but size_groups/size_group_colors/size_group_breakdown were not created.BEGIN;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '22632'
    AND style_number = '40463'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 22632 / style 40463: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 22632';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.27, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'RAW BLACK', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'RAW INDIGO', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 22632';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 3.8, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'RAW BLACK', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 3000;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'RAW INDIGO', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 3000;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 8400,
      total_value_usd = 30648.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '22262'
    AND style_number = '40134'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 22262 / style 40134: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 22262';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.8, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GARDEN BROWN', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 300;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 22262';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.3, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLACK', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GARDEN BROWN', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 2700,
      total_value_usd = 11460.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '22261'
    AND style_number = '40134'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 22261 / style 40134: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 22261';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 4.3, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GARDEN BROWN', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 2400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 22261';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.3, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GARDEN BROWN', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 7800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 10200,
      total_value_usd = 43860.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23086'
    AND style_number = '40134'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23086 / style 40134: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23086';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.3, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLACK', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 1800,
      total_value_usd = 7740.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '22631'
    AND style_number = '43210'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 22631 / style 43210: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 22631';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.36, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'FLINT', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'JORDAN', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'ROCKFORD', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 22631';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 3.9, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'FLINT', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 3600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'JORDAN', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 3600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'ROCKFORD', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 3000;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 13800,
      total_value_usd = 51876.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23084'
    AND style_number = '43366'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23084 / style 43366: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23084';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.3, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLUE RAW RINSE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 1200,
      total_value_usd = 5160.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23477'
    AND style_number = '41808'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23477 / style 41808: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '2-4T' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 2-4T on PO 23477';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '2-4T', 3.05, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,2]::numeric[];
  v_qty := 2400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,2]::numeric[];
  v_qty := 2400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'MID STEEL BLUE', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,6,4]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 23477';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.45, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 4200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 4200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'MID STEEL BLUE', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 3600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23477';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 3.9, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 2)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 7800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 10800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'MID STEEL BLUE', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 6600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 43200,
      total_value_usd = 157980.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23478'
    AND style_number = '41808'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23478 / style 41808: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 23478';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.45, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'MID STEEL BLUE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23478';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 3.9, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'MID STEEL BLUE', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 4800,
      total_value_usd = 18180.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23479'
    AND style_number = '41808'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23479 / style 41808: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '2-4T' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 2-4T on PO 23479';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '2-4T', 3.05, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,2]::numeric[];
  v_qty := 4800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,2]::numeric[];
  v_qty := 4800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 23479';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.45, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,2,2,1]::numeric[];
  v_qty := 7200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,2,2,1]::numeric[];
  v_qty := 7200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23479';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 3.9, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 2)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 14400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'GRANITE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 21600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'MID STEEL BLUE', 2) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 7200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 67200,
      total_value_usd = 247440.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23517'
    AND style_number = '42783'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23517 / style 42783: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '2-4T' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 2-4T on PO 23517';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '2-4T', 3.53, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,2]::numeric[];
  v_qty := 1800;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 23517';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.99, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 3900;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23517';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.5, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 2)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 8040;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'VINTAGE BLACK', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 9840;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 23580,
      total_value_usd = 102375.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23519'
    AND style_number = '42783'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23519 / style 42783: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23519';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.5, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'VINTAGE BLACK', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 2400,
      total_value_usd = 10800.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23520'
    AND style_number = '42783'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23520 / style 42783: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23520';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.5, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'DARK BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 6600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'VINTAGE BLACK', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 7200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 13800,
      total_value_usd = 62100.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23492'
    AND style_number = '49637'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23492 / style 49637: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '2-4T' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 2-4T on PO 23492';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '2-4T', 3.45, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLUE RAW RINSE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,2]::numeric[];
  v_qty := 1200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 23492';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.9, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLUE RAW RINSE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 2400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23492';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.4, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 2)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLUE RAW RINSE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 7200;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLACK RAW RINSE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 8400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 19200,
      total_value_usd = 82140.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23493'
    AND style_number = '49637'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23493 / style 49637: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23493';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 4.4, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLUE RAW RINSE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 14400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'BLACK RAW RINSE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,2,2,1,1]::numeric[];
  v_qty := 14400;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 28800,
      total_value_usd = 126720.0
  WHERE id = v_order_id;
END $$;
DO $$
DECLARE
  v_order_id uuid;
  v_sg_id uuid;
  v_color_id uuid;
  v_sizes text[];
  v_base_size text;
  v_ratio numeric[];
  v_ratio_sum numeric;
  v_qty integer;
  v_alloc integer;
  v_remaining integer;
  i integer;
BEGIN
  SELECT id INTO v_order_id
  FROM orders
  WHERE po_number = '23466'
    AND style_number = '67681 REBUY'
    AND buyer_name = 'STAR RIDE KIDS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Skipping PO 23466 / style 67681 REBUY: order row not found.';
    RETURN;
  END IF;

  DELETE FROM size_groups WHERE order_id = v_order_id;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '2-4T' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 2-4T on PO 23466';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '2-4T', 2.75, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 0)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'INDIGO BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[2,6,4]::numeric[];
  v_qty := 3600;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '4-7' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 4-7 on PO 23466';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '4-7', 3.15, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 1)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'COOL BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 5088;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'INDIGO BLUE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[1,3,4,4]::numeric[];
  v_qty := 5088;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  SELECT sizes, base_size INTO v_sizes, v_base_size FROM size_group_templates WHERE name = '8-16' ORDER BY created_at DESC LIMIT 1;
  IF v_sizes IS NULL OR array_length(v_sizes,1) IS NULL THEN
    RAISE NOTICE 'Template missing for size group 8-16 on PO 23466';
    v_sizes := ARRAY[]::text[];
    v_base_size := NULL;
  END IF;

  INSERT INTO size_groups (order_id, group_name, unit_price, currency, sizes, base_size, sort_order)
  VALUES (v_order_id, '8-16', 3.6, 'USD', COALESCE(v_sizes, ARRAY[]::text[]), v_base_size, 2)
  RETURNING id INTO v_sg_id;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'COOL BLUE', 0) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 1740;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  INSERT INTO size_group_colors (size_group_id, color_name, sort_order) VALUES (v_sg_id, 'INDIGO BLUE', 1) RETURNING id INTO v_color_id;
  v_ratio := ARRAY[3,3,3,2,1]::numeric[];
  v_qty := 4740;
  v_ratio_sum := 0;
  IF array_length(v_ratio,1) IS NOT NULL THEN
    FOR i IN 1..array_length(v_ratio,1) LOOP
      v_ratio_sum := v_ratio_sum + COALESCE(v_ratio[i],0);
    END LOOP;
  END IF;
  v_remaining := v_qty;
  IF array_length(v_sizes,1) IS NULL THEN
    NULL;
  ELSIF array_length(v_sizes,1) <> array_length(v_ratio,1) OR COALESCE(v_ratio_sum,0) = 0 THEN
    -- Fallback: put full qty on first size if template/ratio mismatch
    INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
    VALUES (v_sg_id, v_color_id, v_sizes[1], v_qty);
  ELSE
    FOR i IN 1..array_length(v_sizes,1) LOOP
      IF i = array_length(v_sizes,1) THEN
        v_alloc := v_remaining;
      ELSE
        v_alloc := ROUND((v_ratio[i] / v_ratio_sum) * v_qty);
        v_remaining := v_remaining - v_alloc;
      END IF;
      IF COALESCE(v_alloc,0) > 0 THEN
        INSERT INTO size_group_breakdown (size_group_id, color_id, size, qty)
        VALUES (v_sg_id, v_color_id, v_sizes[i], v_alloc);
      END IF;
    END LOOP;
  END IF;
  UPDATE orders
  SET step_po_matrix = TRUE,
      total_qty = 20256,
      total_value_usd = 65282.4
  WHERE id = v_order_id;
END $$;
COMMIT;
