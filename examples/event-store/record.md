---
title: Event store for the billing service
template: decision-record
theme: paper
accent: blue
show-confidence: false
show-evidence: false
show-good-faith: false
---

# Event store for the billing service
slug: billing-event-store

Where should the new billing service keep its events? An example decision record.

## Reliability
slug: reliability
importance: 40

Billing events must never be lost, and we must recover quickly.

### Durability
slug: durability
weight: 50

#### Postgres
option: postgres
score: 8

#### DynamoDB
option: dynamodb
score: 9

##### Multi-AZ replication by default
slug: multi-az-replication-by-default
weight: 60

##### Point-in-time recovery for 35 days
slug: point-in-time-recovery-for-35-days
weight: 40

#### EventStoreDB
option: eventstoredb
score: 8

### Operational maturity
slug: operational-maturity
weight: 30

#### Postgres
option: postgres
score: 9

##### We already run 14 Postgres clusters with on-call runbooks
slug: we-already-run-14-postgres-clusters-with-on-call-runbooks
weight: 100
by: Sam

#### DynamoDB
option: dynamodb
score: 8

#### EventStoreDB
option: eventstoredb
score: 5

##### Nobody on the team has run it in production
slug: nobody-on-the-team-has-run-it-in-production
weight: 100

### Recovery time
slug: recovery-time
weight: 20

#### Postgres
option: postgres
score: 6

#### DynamoDB
option: dynamodb
score: 9

#### EventStoreDB
option: eventstoredb
score: 6

## Cost
slug: cost
importance: 25

What we pay, in money and in people, at ten times today’s volume.

### Monthly bill at 10×
slug: monthly-bill-at-10
weight: 60

#### Postgres
option: postgres
score: 7

#### DynamoDB
option: dynamodb
score: 4

##### On-demand pricing gets expensive at ten times the writes
slug: on-demand-pricing-gets-expensive-at-ten-times-the-writes
weight: 100

#### Kafka + S3
option: kafka-s3
score: 9

### Team time to run it
slug: team-time-to-run-it
weight: 40

#### Postgres
option: postgres
score: 6

#### DynamoDB
option: dynamodb
score: 9

#### Kafka + S3
option: kafka-s3
score: 5

## Developer speed
slug: developer-speed
importance: 35

How quickly the team can build and change the service.

### Familiar to the team
slug: familiar-to-the-team
weight: 50

#### Postgres
option: postgres
score: 7

#### DynamoDB
option: dynamodb
score: 6

#### EventStoreDB
option: eventstoredb
score: 9

##### Two of us used it at a previous job
slug: two-of-us-used-it-at-a-previous-job
weight: 100

#### Kafka + S3
option: kafka-s3
score: 4

### Local development
slug: local-development
weight: 30

#### Postgres
option: postgres
score: 9

#### DynamoDB
option: dynamodb
score: 5

#### EventStoreDB
option: eventstoredb
score: 8

#### Kafka + S3
option: kafka-s3
score: 4

### Query flexibility
slug: query-flexibility
weight: 20

#### Postgres
option: postgres
score: 8

#### DynamoDB
option: dynamodb
score: 3

#### EventStoreDB
option: eventstoredb
score: 6

#### Kafka + S3
option: kafka-s3
score: 5

## Replay and audit
slug: replay-and-audit
importance: 20

Rebuild any account’s balance from its history, for auditors.

### Native replay
slug: native-replay
weight: 60

#### Postgres
option: postgres
score: 6

#### EventStoreDB
option: eventstoredb
score: 10

##### Streams and projections are the core model
slug: streams-and-projections-are-the-core-model
weight: 100

#### Kafka + S3
option: kafka-s3
score: 8

### Audit export
slug: audit-export
weight: 40

#### Postgres
option: postgres
score: 8

#### EventStoreDB
option: eventstoredb
score: 6

#### Kafka + S3
option: kafka-s3
score: 8
