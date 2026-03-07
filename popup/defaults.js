// defaults.js — Pre-filled profile for Prasanna Kumar Nagaboyina
const DEFAULT_PROFILE = {
  firstName: "Prasanna Kumar",
  lastName:  "Nagaboyina",
  email:     "radhaprasanna77@gmail.com",
  phone:     "+1 (469) 350-3660",
  location:  "Plano, TX",
  linkedin:  "https://linkedin.com/in/pkumar16",
  website:   "https://github.com/Prasanna-Kumar-N-16",
  github:    "https://github.com/Prasanna-Kumar-N-16",
  portfolio: "",
  resumeData: JSON.stringify({
    workAuthorization: "H1B Visa",
    tagline: "Distributed Systems | Go | Kafka | Cloud Infrastructure | Applied Cryptography",
    skills: [
      "Go","Golang","Java","Python","SQL",
      "gRPC","GraphQL","REST","JWT","OAuth2","TLS","RBAC",
      "AWS EKS","AWS EC2","AWS RDS","AWS S3","AWS Lambda","DynamoDB",
      "Docker","Kubernetes","Terraform","GitHub Actions","Jenkins","CI/CD",
      "PostgreSQL","MySQL","MongoDB","Redis","Apache Kafka","AWS SQS","AWS SNS",
      "Microservices","Event-Driven Architecture","Distributed Systems",
      "Prometheus","Grafana","CloudWatch","DataDog","Elasticsearch",
      "PyTest","GoAssert","Postman","Static Analysis"
    ],
    experience: [
      {
        company: "Toyota North America",
        title:   "Product Engineer — Distributed Backend Systems",
        dates:   "Jan 2025 – Present",
        location:"Plano, TX",
        bullets: [
          "[End-to-End Project Ownership] Led design, implementation, and delivery of Golang microservices handling 100K+ daily transactions — broke down large initiatives into scoped tasks, estimated delivery timelines, coordinated across platform, QA, and product teams, and drove releases with zero critical production incidents.",
          "[Resilient Systems & Performance] Identified and resolved latency bottlenecks in distributed services through systematic profiling — implemented Redis caching, optimized SQL queries, and introduced asynchronous Kafka eventing, reducing API latency by 40% while maintaining 99.9% uptime via Grafana/CloudWatch automated alerting.",
          "[Code Quality & Mentorship] Established code review standards, championed static analysis tooling, and mentored 2 junior engineers — increased team velocity by 25% and eliminated single-points-of-failure by documenting system design decisions and sharing context across the team consistently."
        ]
      },
      {
        company: "LEAP IT INC",
        title:   "Software Developer Intern — Security & Cloud Systems",
        dates:   "Sep 2024 – Dec 2024",
        location:"Frisco, TX",
        bullets: [
          "[Applied Cryptography & API Security] Hardened claims-processing microservices (Python/Java) by implementing OAuth2 + RBAC authentication, TLS encryption, and strict input validation — securing REST APIs end-to-end and meeting enterprise-grade security compliance standards.",
          "[Cross-functional Delivery] Collaborated with Product Owners to translate ambiguous user stories into scoped technical specs and test acceptance criteria — delivered 8 production features on schedule across AWS-native infrastructure (ECS/EKS, Lambda, DynamoDB, S3) with Terraform-automated CI/CD pipelines."
        ]
      },
      {
        company: "Cambium Networks Pvt Ltd",
        title:   "Engineer — Go Systems & Network Services",
        dates:   "Dec 2022 – Aug 2023",
        location:"Bengaluru, India",
        bullets: [
          "[Distributed System Reliability] Owned Go-based device management services processing 50K+ configs/day — refactored core concurrency patterns (goroutines, channels, mutexes) to boost throughput by 35%; implemented feature flags and blue-green Kubernetes deployments to achieve zero-downtime releases.",
          "[Knowledge Sharing & Tech Debt Reduction] Built Prometheus + Grafana observability pipelines (reducing MTTR by 50%); authored comprehensive API documentation and runbooks that cut new-hire ramp-up time by 30%, actively preventing knowledge silos across the engineering team."
        ]
      },
      {
        company: "Param Network Pvt Ltd",
        title:   "Application Developer — Microservices & Data Systems",
        dates:   "Jun 2021 – Dec 2022",
        location:"Bengaluru, India",
        bullets: [
          "[Complex Problem Solving] Diagnosed and resolved severe MongoDB aggregation bottlenecks on a logistics platform serving 10K+ concurrent users — redesigned query pipelines, reducing execution time from 2s → 200ms under peak load, integrating Go and Spring Boot microservices with a React.js frontend.",
          "[Infrastructure & Scalability] Containerized full-stack applications with Docker, deployed on Kubernetes with Terraform infrastructure-as-code — improved UX through responsive design, reducing bounce rates by 15% in collaboration with cross-functional design and product teams."
        ]
      }
    ],
    education: [
      { school:"Southern Arkansas University",     degree:"M.S.", field:"Computer Science",                         year:"Aug 2023 – Dec 2024" },
      { school:"University Visvesvaraya College of Engineering", degree:"B.E.", field:"Electronics & Communication Engineering", year:"2017 – 2021" }
    ],
    certifications: [
      "AWS Cloud Essentials — Amazon Web Services (Mar 2025)",
      "GitHub Foundations — GitHub (Jan 2025, exp. Jan 2028)",
      "Postman API Fundamentals Student Expert — Canvas Credentials (Dec 2024)"
    ],
    projects: [
      {
        name: "Authentication & Token Custody Microservice",
        tech: ["Go","PostgreSQL","Kafka","JWT","Docker","Kubernetes","CI/CD"],
        description: "Production-grade Go authentication service with full JWT token lifecycle management (issuance, validation, rotation, revocation), PostgreSQL-backed secure storage, and Kafka-driven event communication.",
        bullets: [
          "[Designed and built a production-grade Go authentication system] with full JWT token lifecycle management (issuance, validation, rotation, revocation), PostgreSQL-backed secure storage, and Kafka-driven event communication — directly analogous to the cryptographic key custody workflows at Anchorage Digital.",
          "Deployed with Docker + Kubernetes, automated via CI/CD pipelines; implemented deterministic unit and integration test suites with 95%+ code coverage, zero known security vulnerabilities at release."
        ]
      }
    ]
  })
};
