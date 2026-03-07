// profile.js — Prasanna Kumar Nagaboyina's complete profile
// Pre-seeded into chrome.storage.local on first install

const PRASANNA_PROFILE = {
  firstName:  "Prasanna Kumar",
  lastName:   "Nagaboyina",
  email:      "radhaprasanna77@gmail.com",
  phone:      "+1 (469) 350-3660",
  location:   "Plano, TX",
  linkedin:   "https://linkedin.com/in/pkumar16",
  github:     "https://github.com/Prasanna-Kumar-N-16",
  portfolio:  "https://github.com/Prasanna-Kumar-N-16",
  website:    "https://github.com/Prasanna-Kumar-N-16",
  visaStatus: "H1B Visa — Transfer Eligible",
  ollamaUrl:   "http://localhost:11434",
  ollamaModel: "llama3",

  resumeData: JSON.stringify({
    tagline: "Distributed Systems · Go · Kafka · Cloud Infrastructure · AWS",
    visaStatus: "H1B Visa — Transfer Eligible",
    summary: "Backend Engineer with 4+ years building scalable microservices in Go, Python, and Java. Currently at Toyota North America, architecting Kafka-driven event systems handling 500K+ daily transactions with 99.9% uptime. Deep expertise in distributed systems, observability (Prometheus/Grafana), and cloud-native AWS deployments. Seeking H1B transfer sponsorship.",

    skills: [
      "Go","Golang","Python","Java","SQL",
      "REST APIs","gRPC","GraphQL","JWT","OAuth2","TLS","RBAC",
      "AWS EKS","AWS EC2","AWS RDS","AWS S3","AWS Lambda","AWS SQS","AWS SNS","DynamoDB",
      "Apache Kafka","Event-Driven Architecture","Async Processing",
      "PostgreSQL","MySQL","MongoDB","Redis","Elasticsearch",
      "Docker","Kubernetes","Terraform","GitHub Actions","Jenkins","CI/CD",
      "Prometheus","Grafana","CloudWatch","DataDog",
      "Microservices","Distributed Systems","Circuit Breakers","Idempotency",
      "GoAssert","PyTest","Postman","Static Analysis"
    ],

    experience: [
      {
        company:  "Toyota North America",
        title:    "Software Engineer — Distributed Backend Systems",
        dates:    "Jan 2025 – Present",
        location: "Plano, TX",
        bullets: [
          "[End-to-End Ownership] Led design, build, and delivery of Go microservices processing 500K+ daily transactions — coordinated across platform, QA, and product teams with zero critical production incidents.",
          "[Performance Engineering] Resolved latency bottlenecks via Redis caching, async Kafka eventing, and SQL optimization — reduced p95 latency from 420ms → 180ms and cut processing time by 35%.",
          "[Reliability & Observability] Built Prometheus/Grafana/CloudWatch alerting pipelines; implemented idempotency safeguards and circuit breakers — reduced incidents by 25% and manual intervention by 30%.",
          "[Code Quality] Established review standards, championed static analysis tooling, mentored 2 junior engineers — increased team velocity by 25% and reduced reconciliation defects by 40%.",
          "[CI/CD] Refactored legacy workflow module with automated test coverage to 85%; reduced release rollbacks by 30% via GitHub Actions zero-downtime deployment pipeline."
        ]
      },
      {
        company:  "Leap IT Inc",
        title:    "Software Developer Intern — Security & Cloud Systems",
        dates:    "Sep 2024 – Dec 2024",
        location: "Frisco, TX",
        bullets: [
          "[API Security] Hardened claims-processing microservices (Python/Java) with OAuth2 + RBAC authentication, TLS encryption, and input validation — reduced security defects and met enterprise compliance standards.",
          "[Cloud Delivery] Delivered 8 production features on schedule across AWS-native infrastructure (ECS/EKS, Lambda, DynamoDB, S3) with Terraform-automated CI/CD; cut manual processing steps by 25%.",
          "[Database Optimization] Optimized PostgreSQL queries and indexing — improved p95 endpoint response time by 28% and reduced CI defect leakage to staging by 20%."
        ]
      },
      {
        company:  "Cambium Networks",
        title:    "Engineer — Go Systems & Network Services",
        dates:    "Dec 2022 – Aug 2023",
        location: "Bengaluru, India",
        bullets: [
          "[Distributed Reliability] Owned Go-based device management services processing 1M+ events/day — refactored concurrency patterns (goroutines, channels) to boost throughput 2.1× and achieve zero-downtime Kubernetes deployments.",
          "[Observability] Built Prometheus + Grafana dashboards reducing time-to-detect regressions from 20 min → under 5 min (MTTR down 50%); implemented circuit breaker and retry/backoff patterns reducing customer disruptions by 37%.",
          "[Storage Optimization] Redesigned query pipelines for high-cardinality data — p95 query latency down 30%; authored runbooks that cut new-hire ramp-up time by 30%."
        ]
      },
      {
        company:  "Param Network",
        title:    "Application Developer — Microservices & Data Systems",
        dates:    "Jun 2021 – Dec 2022",
        location: "Bengaluru, India",
        bullets: [
          "[Complex Problem Solving] Diagnosed and resolved MongoDB aggregation bottlenecks on a 200K+ daily request platform — redesigned query pipelines, reducing execution from 2s → 200ms under peak load.",
          "[API Performance] Improved API latency by 34% via connection pooling, caching, and request shaping; converted synchronous workflows to event-driven processing — peak throughput up 37%, timeouts eliminated.",
          "[Test Coverage] Increased automated test coverage 55% → 82%, cutting regression defects by 30%; introduced structured logging reducing average debugging time by 25%."
        ]
      }
    ],

    projects: [
      {
        name: "Authentication & Token Custody Microservice",
        tech: ["Go","PostgreSQL","Kafka","JWT","Docker","Kubernetes","CI/CD"],
        description: "Production-grade Go authentication service with full JWT token lifecycle management, PostgreSQL-backed secure storage, and Kafka-driven async event communication. 95%+ code coverage.",
        bullets: [
          "[Security Architecture] Built full JWT lifecycle management (issuance, validation, rotation, revocation) with PostgreSQL-backed secure storage — directly analogous to cryptographic key custody workflows.",
          "[Production Quality] Deployed on AWS via Docker + Kubernetes with CI/CD automation; deterministic unit and integration test suites at 95%+ code coverage, zero known security vulnerabilities at release."
        ]
      }
    ],

    education: [
      {
        school: "Southern Arkansas University",
        degree: "M.S.",
        field:  "Computer Science",
        year:   "Aug 2023 – Dec 2024"
      },
      {
        school: "University Visvesvaraya College of Engineering",
        degree: "B.E.",
        field:  "Electronics & Communication Engineering",
        year:   "2017 – 2021"
      }
    ],

    certifications: [
      "AWS Cloud Essentials — Amazon Web Services (Mar 2025)",
      "GitHub Foundations — GitHub (Jan 2025, exp. Jan 2028)",
      "Postman API Fundamentals Student Expert — Canvas Credentials (Dec 2024)"
    ]
  })
};
