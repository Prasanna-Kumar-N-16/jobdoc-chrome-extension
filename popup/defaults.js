// defaults.js — Pre-filled profile for Prasanna Kumar Nagaboyina
// This file is auto-loaded on first install. You can update it anytime via the Profile tab.

const DEFAULT_PROFILE = {
  firstName: "Prasanna Kumar",
  lastName: "Nagaboyina",
  email: "radhaprasanna77@gmail.com",
  phone: "+1 (469) 350-3660",
  location: "Plano, TX",
  linkedin: "https://linkedin.com/in/prasannakumar-nagaboyina",
  website: "https://github.com/prasannakumar-nagaboyina",
  github: "https://github.com/prasannakumar-nagaboyina",
  portfolio: "",
  coverLetterTemplate: "Professional and confident tone. Emphasize Golang expertise, cloud-native architecture, and measurable impact metrics. Mention H1B visa work authorization. Highlight distributed systems experience and team mentorship. Lead with the most impressive metric relevant to the role.",

  resumeData: JSON.stringify({
    yearsExperience: 4,
    workAuthorization: "H1B Visa",
    skills: [
      "Go", "Golang", "Java", "Python", "JavaScript", "SQL",
      "Spring Boot", "FastAPI", "Gin", "gRPC", "REST", "JWT", "OAuth2", "TLS",
      "AWS", "EC2", "ECS", "EKS", "Lambda", "S3", "RDS", "VPC", "DynamoDB",
      "Docker", "Kubernetes", "Terraform", "GitHub Actions", "Jenkins",
      "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "AWS SQS", "AWS SNS",
      "Microservices", "Event-Driven Architecture", "CI/CD",
      "React", "Redux", "HTML5", "CSS3",
      "Prometheus", "Grafana", "CloudWatch", "Elasticsearch",
      "Agile", "Scrum", "GoAssert", "PyTest", "Postman"
    ],
    experience: [
      {
        company: "Toyota North America",
        title: "Product Engineer",
        dates: "Jan 2025 – Present",
        location: "Plano, TX",
        bullets: [
          "Reduced API latency by 40% across Golang microservices handling 100K+ daily transactions via optimized SQL queries, Redis in-memory caching, and asynchronous Kafka event processing",
          "Cut deployment time from 45 → 10 minutes by engineering end-to-end CI/CD pipelines with GitHub Actions & Jenkins, enabling daily releases with zero manual intervention",
          "Maintained 99.9% uptime via CloudWatch/Grafana monitoring and automated alerting",
          "Mentored 2 junior engineers and drove Agile ceremonies, boosting team velocity by 25%"
        ]
      },
      {
        company: "LEAP IT INC",
        title: "Software Developer Intern",
        dates: "Sep 2024 – Dec 2024",
        location: "Frisco, TX",
        bullets: [
          "Improved claims-processing throughput by 20% by building Python and Java microservices with Celery parallel task execution",
          "Secured REST APIs with OAuth2 + RBAC and added Elasticsearch dashboards for full traceability",
          "Deployed cloud-native applications on AWS (ECS/EKS, Lambda, DynamoDB, S3) with Terraform-automated infrastructure",
          "Delivered 8 features on schedule in collaboration with Product Owners"
        ]
      },
      {
        company: "Cambium Networks Pvt Ltd",
        title: "Engineer",
        dates: "Dec 2022 – Aug 2023",
        location: "Bengaluru, India",
        bullets: [
          "Built Go-based services processing 50K+ device configs/day; refactored core modules to boost throughput by 35%",
          "Implemented feature flags and blue-green deployments for zero-downtime Kubernetes releases",
          "Reduced incident MTTR by 50% by creating Prometheus exporters and Grafana dashboards for real-time metrics",
          "Authored runbooks that cut new-hire ramp-up time by 30%"
        ]
      },
      {
        company: "Param Network Pvt Ltd",
        title: "Application Developer",
        dates: "Jun 2021 – Dec 2022",
        location: "Bengaluru, India",
        bullets: [
          "Built React.js logistics-tracking modules integrated with Go and Spring Boot microservices, supporting real-time updates for 10K+ users",
          "Optimized MongoDB aggregation pipelines cutting query time from 2s → 200ms under peak load",
          "Containerized full-stack apps with Docker and deployed on Kubernetes with Terraform-managed infrastructure",
          "Decreased bounce rates by 15% through improved responsive design and UX enhancements"
        ]
      }
    ],
    education: [
      {
        school: "Southern Arkansas University",
        degree: "M.S.",
        field: "Computer Science",
        year: "Dec 2024"
      },
      {
        school: "University Visvesvaraya College of Engineering",
        degree: "B.E.",
        field: "Electronics & Communication Engineering",
        year: "2021"
      }
    ],
    certifications: [
      "AWS Cloud Essentials (Mar 2025)",
      "GitHub Foundations (Jan 2025, exp. Jan 2028)",
      "Postman API Fundamentals Expert (Dec 2024)"
    ],
    projects: []
  })
};
