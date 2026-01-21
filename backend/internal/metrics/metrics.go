package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// ============================================
	// 数据库连接指标
	// ============================================
	DBConnectionPoolSize = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "backend_db_connection_pool_size",
		Help: "Database connection pool size",
	})

	DBConnectionActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "backend_db_connection_active",
		Help: "Number of active database connections",
	})

	DBConnectionIdle = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "backend_db_connection_idle",
		Help: "Number of idle database connections",
	})

	DBConnectionStatus = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "backend_db_connection_status",
		Help: "Database connection status (1=healthy, 0=unhealthy)",
	})

	DBQueryDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "backend_db_query_duration_seconds",
			Help:    "Database query duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"query_type"},
	)

	// ============================================
	// NATS 连接和消息指标
	// ============================================
	NATSConnectionStatus = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "backend_nats_connection_status",
		Help: "NATS connection status (1=connected, 0=disconnected)",
	})

	NATSMessagesReceived = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "backend_nats_messages_received_total",
			Help: "Total number of NATS messages received",
		},
		[]string{"event_type"},
	)

	NATSMessagesProcessed = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "backend_nats_messages_processed_total",
			Help: "Total number of NATS messages processed successfully",
		},
		[]string{"event_type"},
	)

	NATSMessagesFailed = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "backend_nats_messages_failed_total",
			Help: "Total number of NATS messages failed to process",
		},
		[]string{"event_type", "error_type"},
	)

	NATSSubscriptionStatus = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "backend_nats_subscription_status",
			Help: "NATS subscription status (1=active, 0=inactive)",
		},
		[]string{"subject"},
	)

	// ============================================
	// 事件监听指标
	// ============================================
	EventListenerStatus = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "backend_event_listener_status",
			Help: "Event listener status (1=active, 0=inactive)",
		},
		[]string{"event_type"},
	)

	EventListenerErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "backend_event_listener_errors_total",
			Help: "Total number of event listener errors",
		},
		[]string{"event_type", "error_type"},
	)

	EventProcessingDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "backend_event_processing_duration_seconds",
			Help:    "Event processing duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"event_type"},
	)

	// ============================================
	// 余额监控指标
	// ============================================
	PrivateKeyBalance = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "backend_private_key_balance",
			Help: "PrivateKey corresponding address balance",
		},
		[]string{"chain", "address"},
	)
)



