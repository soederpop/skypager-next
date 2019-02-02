workflow "New workflow" {
  on = "push"
  resolves = ["Docker Registry", "GitHub Action for Docker"]
}

action "Docker Registry" {
  uses = "actions/docker/login@c08a5fc9e0286844156fefff2c141072048141f6"
  secrets = ["DOCKER_USERNAME", "DOCKER_PASSWORD"]
}

action "GitHub Action for Docker" {
  uses = "actions/docker/cli@c08a5fc9e0286844156fefff2c141072048141f6"
  args = "build -t datapimp/skypager ."
}
