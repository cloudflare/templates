# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build

# Set destination for COPY
WORKDIR /app

# Download any Go modules
COPY container_src/go.mod ./
RUN go mod download

# Copy container source code
COPY container_src/*.go ./

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o /server

FROM scratch
COPY --from=build /server /server
EXPOSE 8080

# Run
CMD ["/server"]