---
x: Weight
y: Score
color: y
colorMode: split
colorLeft: #C0392B
colorRight: #1E8449
reverse: false
theme: paper
tag.evidence: fill #E3F1F6; border none solid; opacity 1
---

# Event store for the billing service
Where should the new billing service keep its events? An example decision record.
- Reliability {x:1}
  Billing events must never be lost, and we must recover quickly.
  - Durability {x:1}
    - Postgres {y:0.8}
    - DynamoDB {y:0.9}
      - Multi-AZ replication by default {x:1}
      - Point-in-time recovery for 35 days {x:0.667}
    - EventStoreDB {y:0.8}
  - Operational maturity {x:0.6}
    - Postgres {y:0.9}
      - We already run 14 Postgres clusters with on-call runbooks {x:1}
        By Sam
    - DynamoDB {y:0.8}
    - EventStoreDB {y:0.5}
      - Nobody on the team has run it in production {x:1}
  - Recovery time {x:0.4}
    - Postgres {y:0.6}
    - DynamoDB {y:0.9}
    - EventStoreDB {y:0.6}
- Cost {x:0.625}
  What we pay, in money and in people, at ten times today’s volume.
  - Monthly bill at 10× {x:1}
    - Postgres {y:0.7}
    - DynamoDB {y:0.4}
      - On-demand pricing gets expensive at ten times the writes {x:1}
    - Kafka + S3 {y:0.9}
  - Team time to run it {x:0.667}
    - Postgres {y:0.6}
    - DynamoDB {y:0.9}
    - Kafka + S3 {y:0.5}
- Developer speed {x:0.875}
  How quickly the team can build and change the service.
  - Familiar to the team {x:1}
    - Postgres {y:0.7}
    - DynamoDB {y:0.6}
    - EventStoreDB {y:0.9}
      - Two of us used it at a previous job {x:1}
    - Kafka + S3 {y:0.4}
  - Local development {x:0.6}
    - Postgres {y:0.9}
    - DynamoDB {y:0.5}
    - EventStoreDB {y:0.8}
    - Kafka + S3 {y:0.4}
  - Query flexibility {x:0.4}
    - Postgres {y:0.8}
    - DynamoDB {y:0.3}
    - EventStoreDB {y:0.6}
    - Kafka + S3 {y:0.5}
- Replay and audit {x:0.5}
  Rebuild any account’s balance from its history, for auditors.
  - Native replay {x:1}
    - Postgres {y:0.6}
    - EventStoreDB {y:1}
      - Streams and projections are the core model {x:1}
    - Kafka + S3 {y:0.8}
  - Audit export {x:0.667}
    - Postgres {y:0.8}
    - EventStoreDB {y:0.6}
    - Kafka + S3 {y:0.8}
