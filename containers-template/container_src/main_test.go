package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	newRouter().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/health", nil))
	if w.Code != http.StatusOK || w.Body.Len() != 0 {
		t.Fatalf("health: status=%d body=%q", w.Code, w.Body.String())
	}
}

func TestMessageAndInstance(t *testing.T) {
	t.Setenv("MESSAGE", "hello from startup")
	t.Setenv("INSTANCE_ID", "test-instance")
	for _, path := range []string{"/container/one", "/lb", "/singleton"} {
		w := httptest.NewRecorder()
		newRouter().ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "hello from startup") || !strings.Contains(w.Body.String(), "test-instance") {
			t.Fatalf("%s: status=%d body=%q", path, w.Code, w.Body.String())
		}
	}
}

func TestErrorExitsProcess(t *testing.T) {
	if os.Getenv("TEST_CONTAINER_ERROR_EXIT") == "1" {
		newRouter().ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/error", nil))
		return
	}
	command := exec.Command(os.Args[0], "-test.run=^TestErrorExitsProcess$")
	command.Env = append(os.Environ(), "TEST_CONTAINER_ERROR_EXIT=1")
	output, err := command.CombinedOutput()
	exit, ok := err.(*exec.ExitError)
	if !ok || exit.ExitCode() != 1 || !strings.Contains(string(output), "Exiting with code 1") {
		t.Fatalf("expected exit 1 from error route; err=%v output=%s", err, output)
	}
}
