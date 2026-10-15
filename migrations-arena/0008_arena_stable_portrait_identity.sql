-- Persist the chosen fictional identity; names/order/showcase never change it.
ALTER TABLE arena_sellers ADD COLUMN avatar_index INTEGER CHECK(avatar_index BETWEEN 0 AND 15);
