-- Recherche par image (demande du porteur, 1er novembre 2026) : empreinte CLIP de chaque photo publiée.
-- Exige l'image Docker pgvector/pgvector:pg16-trixie à la place de postgres:16 (mêmes données, extension en plus).
-- Pas d'index pour l'instant : le parcours exact reste rapide ; un index HNSW deviendra utile vers 200 000 photos.
begin;
create extension if not exists vector;
alter table listing_images add column if not exists embedding vector(512);
commit;
