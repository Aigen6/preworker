module go-backend

go 1.23.0

require (
	github.com/ethereum/go-ethereum v1.16.2
	github.com/gin-gonic/gin v1.10.1
	github.com/golang-jwt/jwt/v5 v5.3.0
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.4.2
	github.com/lib/pq v1.10.9
	github.com/nats-io/nats.go v1.37.0
	github.com/pquerna/otp v1.5.0
	github.com/prometheus/client_golang v1.23.2
	github.com/sirupsen/logrus v1.9.3
	golang.org/x/crypto v0.44.0
	gopkg.in/yaml.v3 v3.0.1
	gorm.io/driver/postgres v1.5.9
	gorm.io/gorm v1.30.0
)

require (
	github.com/Microsoft/go-winio v0.6.2 // indirect
	github.com/StackExchange/wmi v1.2.1 // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/bits-and-blooms/bitset v1.20.0 // indirect
	github.com/boombuler/barcode v1.0.1-0.20190219062509-6c824513bacc // indirect
	github.com/bytedance/sonic v1.13.3 // indirect
	github.com/bytedance/sonic/loader v0.3.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/cloudwego/base64x v0.1.5 // indirect
	github.com/consensys/bavard v0.1.27 // indirect
	github.com/consensys/gnark-crypto v0.18.0 // indirect
	github.com/crate-crypto/go-eth-kzg v1.3.0 // indirect
	github.com/crate-crypto/go-ipa v0.0.0-20240724233137-53bbb0ceb27a // indirect
	github.com/deckarep/golang-set/v2 v2.6.0 // indirect
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.0.1 // indirect
	github.com/ethereum/c-kzg-4844/v2 v2.1.0 // indirect
	github.com/ethereum/go-verkle v0.2.2 // indirect
	github.com/fsnotify/fsnotify v1.6.0 // indirect
	github.com/gabriel-vasile/mimetype v1.4.9 // indirect
	github.com/gin-contrib/sse v1.1.0 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/go-playground/locales v0.14.1 // indirect
	github.com/go-playground/universal-translator v0.18.1 // indirect
	github.com/go-playground/validator/v10 v10.27.0 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/golang-jwt/jwt/v4 v4.5.2 // indirect
	github.com/holiman/uint256 v1.3.2 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20221227161230-091c0ba34f0a // indirect
	github.com/jackc/pgx/v5 v5.5.5 // indirect
	github.com/jackc/puddle/v2 v2.2.1 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/json-iterator/go v1.1.12 // indirect
	github.com/klauspost/compress v1.18.0 // indirect
	github.com/klauspost/cpuid/v2 v2.2.11 // indirect
	github.com/leodido/go-urn v1.4.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mmcloughlin/addchain v0.4.0 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/nats-io/nkeys v0.4.7 // indirect
	github.com/nats-io/nuid v1.0.1 // indirect
	github.com/pelletier/go-toml/v2 v2.2.4 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.66.1 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	github.com/rogpeppe/go-internal v1.14.1 // indirect
	github.com/shirou/gopsutil v3.21.4-0.20210419000835-c7a38de76ee5+incompatible // indirect
	github.com/supranational/blst v0.3.14 // indirect
	github.com/tklauser/go-sysconf v0.3.12 // indirect
	github.com/tklauser/numcpus v0.6.1 // indirect
	github.com/twitchyliquid64/golang-asm v0.15.1 // indirect
	github.com/ugorji/go/codec v1.3.0 // indirect
	go.yaml.in/yaml/v2 v2.4.2 // indirect
	golang.org/x/arch v0.19.0 // indirect
	golang.org/x/exp v0.0.0-20231110203233-9a3e6036ecaa // indirect
	golang.org/x/net v0.43.0 // indirect
	golang.org/x/sync v0.16.0 // indirect
	golang.org/x/sys v0.35.0 // indirect
	golang.org/x/text v0.28.0 // indirect
	google.golang.org/protobuf v1.36.8 // indirect
	rsc.io/tmplfunc v0.0.3 // indirect
)

// Go 1.21兼容性替换，降级需要Go 1.23+的包

// Go 1.21兼容性替换，降级需要Go 1.23+的包
replace golang.org/x/crypto => golang.org/x/crypto v0.19.0

replace golang.org/x/net => golang.org/x/net v0.20.0

replace golang.org/x/text => golang.org/x/text v0.14.0

replace golang.org/x/sys => golang.org/x/sys v0.16.0

replace golang.org/x/sync => golang.org/x/sync v0.5.0

replace github.com/gabriel-vasile/mimetype => github.com/gabriel-vasile/mimetype v1.4.3

replace github.com/gin-contrib/sse => github.com/gin-contrib/sse v0.1.0

replace google.golang.org/protobuf => google.golang.org/protobuf v1.31.0

replace github.com/consensys/gnark-crypto => github.com/consensys/gnark-crypto v0.12.1

replace github.com/rogpeppe/go-internal => github.com/rogpeppe/go-internal v1.12.0

replace golang.org/x/arch => golang.org/x/arch v0.11.0
