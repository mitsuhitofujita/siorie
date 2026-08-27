// Command server starts the siorie API HTTP server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/googleauth"
	"github.com/mitsuhitofujita/siorie/apps/api/internal/server"
	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

const defaultPort = "8080"

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	clientID := requireEnv("GOOGLE_CLIENT_ID")
	appOrigin := requireEnv("APP_ORIGIN")
	projectID := requireEnv("FIRESTORE_PROJECT_ID")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	firestoreClient, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		log.Fatalf("firestore client: %v", err)
	}
	defer firestoreClient.Close()

	firestoreStore := &store.FirestoreStore{Client: firestoreClient}

	httpServer := &http.Server{
		Addr: ":" + port,
		Handler: server.NewRouter(server.Deps{
			Verifier:  &googleauth.GoogleVerifier{ClientID: clientID},
			Users:     firestoreStore,
			Sessions:  firestoreStore,
			Groups:    firestoreStore,
			Items:     firestoreStore,
			AppOrigin: appOrigin,
		}),
	}

	go func() {
		log.Printf("listening on :%s", port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
}

// requireEnv reads an environment variable the server cannot run without and
// exits with a clear message if it is unset, rather than starting in a
// half-configured state.
func requireEnv(name string) string {
	value := os.Getenv(name)
	if value == "" {
		log.Fatalf("%s environment variable is required", name)
	}
	return value
}
