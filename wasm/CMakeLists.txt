if(NOT EMSCRIPTEN)
	message(FATAL_ERROR "The wasm/ directory must be configured with emcmake (Emscripten).")
endif()

add_executable(chiaki-wasm
	src/chiaki_wasm.c
	src/chiaki_wasm_net.c)
target_include_directories(chiaki-wasm PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_link_libraries(chiaki-wasm PRIVATE chiaki-lib)
set_target_properties(chiaki-wasm PROPERTIES OUTPUT_NAME chiaki SUFFIX ".js")

set(_CHIAKI_WASM_EXPORTS
	_malloc
	_free
	_chiaki_wasm_init
	_chiaki_wasm_fini
	_chiaki_wasm_version
	_chiaki_wasm_net_ready
	_chiaki_wasm_discover_start
	_chiaki_wasm_discover_stop
	_chiaki_wasm_wakeup
	_chiaki_wasm_regist
	_chiaki_wasm_session_start
	_chiaki_wasm_session_stop
	_chiaki_wasm_session_set_controller
	_chiaki_wasm_session_set_pin
	_chiaki_wasm_session_goto_bed
	_chiaki_wasm_session_go_home
	_chiaki_wasm_session_request_idr)

string(JOIN "," _CHIAKI_WASM_EXPORTS_JOINED ${_CHIAKI_WASM_EXPORTS})

set(_CHIAKI_WASM_WRAP
	socket close bind connect send sendto recv recvfrom
	setsockopt getsockopt getsockname getpeername shutdown
	listen accept pipe read write fcntl select getaddrinfo freeaddrinfo)

set(_WRAP_FLAGS "")
foreach(_sym ${_CHIAKI_WASM_WRAP})
	list(APPEND _WRAP_FLAGS "SHELL:-Wl,--wrap=${_sym}")
endforeach()

target_link_options(chiaki-wasm PRIVATE
	"SHELL:-pthread"
	"SHELL:-lwebsocket.js"
	"SHELL:-sPTHREAD_POOL_SIZE=16"
	"SHELL:-sPTHREAD_POOL_SIZE_STRICT=0"
	"SHELL:-sINITIAL_MEMORY=134217728"
	"SHELL:-sSTACK_SIZE=262144"
	"SHELL:-sDEFAULT_PTHREAD_STACK_SIZE=262144"
	"SHELL:-sALLOW_MEMORY_GROWTH=0"
	"SHELL:-sEXIT_RUNTIME=0"
	"SHELL:-sENVIRONMENT=web,worker"
	"SHELL:-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAPU8,HEAP16"
	"SHELL:-sEXPORTED_FUNCTIONS=${_CHIAKI_WASM_EXPORTS_JOINED}"
	${_WRAP_FLAGS})

target_compile_options(chiaki-wasm PRIVATE -pthread)
target_compile_options(chiaki-lib PRIVATE -pthread)

file(COPY "${CMAKE_CURRENT_SOURCE_DIR}/www/" DESTINATION "${CMAKE_CURRENT_BINARY_DIR}")

add_custom_command(TARGET chiaki-wasm POST_BUILD
	COMMAND "${CMAKE_COMMAND}" -E copy_directory
		"${CMAKE_CURRENT_SOURCE_DIR}/www"
		"${CMAKE_CURRENT_BINARY_DIR}"
	COMMAND "${CMAKE_COMMAND}" -E copy_if_different
		"${CMAKE_CURRENT_SOURCE_DIR}/proxy/server.mjs"
		"${CMAKE_CURRENT_SOURCE_DIR}/proxy/env.mjs"
		"${CMAKE_CURRENT_SOURCE_DIR}/proxy/store.mjs"
		"${CMAKE_CURRENT_SOURCE_DIR}/proxy/share.mjs"
		"${CMAKE_CURRENT_SOURCE_DIR}/proxy/rust-relay.mjs"
		"${CMAKE_CURRENT_BINARY_DIR}"
	COMMAND "${CMAKE_COMMAND}" -E copy_directory
		"${CMAKE_CURRENT_SOURCE_DIR}/proxy/certs"
		"${CMAKE_CURRENT_BINARY_DIR}/certs")

message(STATUS "Chiaki WASM output directory: ${CMAKE_CURRENT_BINARY_DIR}")

# Explicit regression target; kept out of the shipping browser bundle.
if(CHIAKI_LIB_ENABLE_MBEDTLS AND TARGET mbedcrypto)
	add_executable(chiaki-wasm-crypto-test EXCLUDE_FROM_ALL
		tests/rpcrypt.c "${PROJECT_SOURCE_DIR}/lib/src/rpcrypt.c")
	target_include_directories(chiaki-wasm-crypto-test PRIVATE
		"${PROJECT_SOURCE_DIR}/lib/include" "${PROJECT_BINARY_DIR}/lib/include")
	target_compile_definitions(chiaki-wasm-crypto-test PRIVATE CHIAKI_LIB_ENABLE_MBEDTLS)
	target_compile_options(chiaki-wasm-crypto-test PRIVATE -pthread -fsanitize=address -O1 -g -UNDEBUG)
	target_link_libraries(chiaki-wasm-crypto-test PRIVATE mbedcrypto)
	target_link_options(chiaki-wasm-crypto-test PRIVATE -pthread -fsanitize=address
		"SHELL:-sENVIRONMENT=node" "SHELL:-sEXIT_RUNTIME=1"
		"SHELL:-Wl,--wrap=mbedtls_md_hmac_finish")
	set_target_properties(chiaki-wasm-crypto-test PROPERTIES OUTPUT_NAME rpcrypt-test SUFFIX ".cjs")
endif()
