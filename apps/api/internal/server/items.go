package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

// itemsDeps are the dependencies the item handlers need.
type itemsDeps struct {
	sessions  store.SessionStore
	groups    store.GroupStore
	items     store.ItemStore
	appOrigin string
}

type itemBody struct {
	ID              string `json:"id" doc:"Item ID"`
	Title           string `json:"title" doc:"Item title"`
	CompletedVolume int    `json:"completedVolume" doc:"Number of volumes read"`
}

func itemBodyFrom(it *store.Item) itemBody {
	return itemBody{ID: it.ID, Title: it.Title, CompletedVolume: it.CompletedVolume}
}

// requireGroup confirms groupID exists for userID, returning a 404
// huma.StatusError if it doesn't. Firestore subcollections don't require
// their parent document to exist, so every item handler validates the
// parent group first rather than allowing items under a missing/foreign
// group.
func requireGroup(ctx context.Context, groups store.GroupStore, userID, groupID string) error {
	_, err := groups.GetGroup(ctx, userID, groupID)
	if errors.Is(err, store.ErrGroupNotFound) {
		return huma.Error404NotFound("group not found")
	} else if err != nil {
		return huma.Error500InternalServerError("failed to get group")
	}
	return nil
}

func registerItemRoutes(api huma.API, deps itemsDeps) {
	type GroupPathInput struct {
		Session string `cookie:"__Host-session"`
		GroupID string `path:"groupId"`
	}
	type GetItemsOutput struct {
		Body []itemBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "get-items",
		Method:      http.MethodGet,
		Path:        "/api/groups/{groupId}/items",
		Summary:     "List a group's items",
	}, func(ctx context.Context, input *GroupPathInput) (*GetItemsOutput, error) {
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}
		if err := requireGroup(ctx, deps.groups, userID, input.GroupID); err != nil {
			return nil, err
		}

		items, err := deps.items.ListItems(ctx, userID, input.GroupID)
		if err != nil {
			return nil, huma.Error500InternalServerError("failed to list items")
		}

		resp := &GetItemsOutput{Body: make([]itemBody, len(items))}
		for i, it := range items {
			resp.Body[i] = itemBodyFrom(it)
		}
		return resp, nil
	})

	type PostItemInput struct {
		Session string `cookie:"__Host-session"`
		Origin  string `header:"Origin"`
		GroupID string `path:"groupId"`
		Body    struct {
			Title           string `json:"title" required:"true" minLength:"1" maxLength:"100" doc:"Item title"`
			CompletedVolume int    `json:"completedVolume" required:"true" minimum:"0" doc:"Number of volumes read"`
		}
	}
	type PostItemOutput struct {
		Body itemBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "post-item",
		Method:      http.MethodPost,
		Path:        "/api/groups/{groupId}/items",
		Summary:     "Create an item in a group",
	}, func(ctx context.Context, input *PostItemInput) (*PostItemOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}
		if err := requireGroup(ctx, deps.groups, userID, input.GroupID); err != nil {
			return nil, err
		}

		item, err := deps.items.CreateItem(ctx, userID, input.GroupID, input.Body.Title, input.Body.CompletedVolume)
		if err != nil {
			return nil, huma.Error500InternalServerError("failed to create item")
		}

		resp := &PostItemOutput{}
		resp.Body = itemBodyFrom(item)
		return resp, nil
	})

	type ItemPathInput struct {
		Session string `cookie:"__Host-session"`
		GroupID string `path:"groupId"`
		ItemID  string `path:"itemId"`
	}
	type GetItemOutput struct {
		Body itemBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "get-item",
		Method:      http.MethodGet,
		Path:        "/api/groups/{groupId}/items/{itemId}",
		Summary:     "Get an item",
	}, func(ctx context.Context, input *ItemPathInput) (*GetItemOutput, error) {
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}
		if err := requireGroup(ctx, deps.groups, userID, input.GroupID); err != nil {
			return nil, err
		}

		item, err := deps.items.GetItem(ctx, userID, input.GroupID, input.ItemID)
		if errors.Is(err, store.ErrItemNotFound) {
			return nil, huma.Error404NotFound("item not found")
		} else if err != nil {
			return nil, huma.Error500InternalServerError("failed to get item")
		}

		resp := &GetItemOutput{}
		resp.Body = itemBodyFrom(item)
		return resp, nil
	})

	type PatchItemInput struct {
		Session string `cookie:"__Host-session"`
		Origin  string `header:"Origin"`
		GroupID string `path:"groupId"`
		ItemID  string `path:"itemId"`
		Body    struct {
			Title           string `json:"title" required:"true" minLength:"1" maxLength:"100" doc:"Item title"`
			CompletedVolume int    `json:"completedVolume" required:"true" minimum:"0" doc:"Number of volumes read"`
		}
	}
	type PatchItemOutput struct {
		Body itemBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "patch-item",
		Method:      http.MethodPatch,
		Path:        "/api/groups/{groupId}/items/{itemId}",
		Summary:     "Update an item",
	}, func(ctx context.Context, input *PatchItemInput) (*PatchItemOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}
		if err := requireGroup(ctx, deps.groups, userID, input.GroupID); err != nil {
			return nil, err
		}

		item, err := deps.items.UpdateItem(ctx, userID, input.GroupID, input.ItemID, input.Body.Title, input.Body.CompletedVolume)
		if errors.Is(err, store.ErrItemNotFound) {
			return nil, huma.Error404NotFound("item not found")
		} else if err != nil {
			return nil, huma.Error500InternalServerError("failed to update item")
		}

		resp := &PatchItemOutput{}
		resp.Body = itemBodyFrom(item)
		return resp, nil
	})

	type DeleteItemInput struct {
		Session string `cookie:"__Host-session"`
		Origin  string `header:"Origin"`
		GroupID string `path:"groupId"`
		ItemID  string `path:"itemId"`
	}
	type DeleteItemOutput struct{}

	huma.Register(api, huma.Operation{
		OperationID: "delete-item",
		Method:      http.MethodDelete,
		Path:        "/api/groups/{groupId}/items/{itemId}",
		Summary:     "Delete an item",
	}, func(ctx context.Context, input *DeleteItemInput) (*DeleteItemOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}
		if err := requireGroup(ctx, deps.groups, userID, input.GroupID); err != nil {
			return nil, err
		}

		// DeleteItem is idempotent (deleting an already-gone item is not an
		// error), matching DeleteGroup's retry-safety.
		if err := deps.items.DeleteItem(ctx, userID, input.GroupID, input.ItemID); err != nil {
			return nil, huma.Error500InternalServerError("failed to delete item")
		}

		return &DeleteItemOutput{}, nil
	})
}
