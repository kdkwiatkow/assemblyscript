(module
 (type $v (func))
 (import "foo" "var" (global $external/var_ i32))
 (import "external" "foo" (func $external/foo))
 (import "external" "foo.bar" (func $external/foo.bar))
 (import "external" "bar" (func $external/two))
 (import "foo" "baz" (func $external/three))
 (memory $0 0)
 (table $0 1 anyfunc)
 (elem (i32.const 0) $null)
 (export "memory" (memory $0))
 (export "table" (table $0))
 (export "foo.bar" (func $external/foo.bar))
 (export "foo" (func $external/foo))
 (export "two" (func $external/two))
 (export "three" (func $external/three))
 (export "var_" (global $external/var_))
 (func $null (; 4 ;) (type $v)
  nop
 )
)
