-- Add symbolic scoped definitions without changing any applied migration or AST version.
-- Version1 keeps its original compatibility; version2 has exact, credential-free keys.
ALTER TABLE "SmartCollection" DROP CONSTRAINT "SmartCollection_definition_check";
ALTER TABLE "SmartCollection" ADD CONSTRAINT "SmartCollection_definition_check" CHECK (
 jsonb_typeof(definition)='object'
 AND definition ?& ARRAY['version','text','filter','lifecycle']
 AND jsonb_typeof(definition->'text')='string'
 AND jsonb_typeof(definition->'filter') IN ('object','null')
 AND definition->>'lifecycle' IN ('ACTIVE','ARCHIVED','DISPOSED','ALL')
 AND octet_length(definition::text)<=32768
 AND (
  definition->'version'='1'::jsonb
  OR (
   definition->'version'='2'::jsonb
   AND definition ? 'scope'
   AND jsonb_typeof(definition->'lifecycle')='string'
   AND jsonb_typeof(definition->'scope'->'kind')='string'
   AND definition-ARRAY['version','scope','text','filter','lifecycle']='{}'::jsonb
   AND jsonb_typeof(definition->'scope')='object'
   AND (
    (
     definition->'scope' ?& ARRAY['kind','collectionId']
     AND definition->'scope'->>'kind'='MEMBER_COLLECTION'
     AND (definition->'scope')-ARRAY['kind','collectionId']='{}'::jsonb
     AND jsonb_typeof(definition->'scope'->'collectionId')='string'
     AND definition->'scope'->>'collectionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) OR (
     definition->'scope' ?& ARRAY['kind','shareId']
     AND definition->'scope'->>'kind'='SHARE'
     AND (definition->'scope')-ARRAY['kind','shareId']='{}'::jsonb
     AND jsonb_typeof(definition->'scope'->'shareId')='string'
     AND definition->'scope'->>'shareId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
   )
  )
 )
);
