package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/mitsuhitofujita/siorie/apps/api/internal/store"
)

// groupsDeps are the dependencies the group handlers need.
type groupsDeps struct {
	sessions  store.SessionStore
	groups    store.GroupStore
	appOrigin string
}

type groupBody struct {
	ID   string `json:"id" doc:"Group ID"`
	Name string `json:"name" doc:"Group name"`
}

func groupBodyFrom(g *store.Group) groupBody {
	return groupBody{ID: g.ID, Name: g.Name}
}

func registerGroupRoutes(api huma.API, deps groupsDeps) {
	type SessionInput struct {
		Session string `cookie:"__Host-session"`
	}

	type GetGroupsOutput struct {
		Body []groupBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "get-groups",
		Method:      http.MethodGet,
		Path:        "/api/groups",
		Summary:     "List the signed-in user's groups",
	}, func(ctx context.Context, input *SessionInput) (*GetGroupsOutput, error) {
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}

		groups, err := deps.groups.ListGroups(ctx, userID)
		if err != nil {
			return nil, huma.Error500InternalServerError("failed to list groups")
		}

		resp := &GetGroupsOutput{Body: make([]groupBody, len(groups))}
		for i, g := range groups {
			resp.Body[i] = groupBodyFrom(g)
		}
		return resp, nil
	})

	type PostGroupInput struct {
		Session string `cookie:"__Host-session"`
		Origin  string `header:"Origin"`
		Body    struct {
			Name string `json:"name" required:"true" minLength:"1" maxLength:"100" doc:"Group name"`
		}
	}
	type PostGroupOutput struct {
		Body groupBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "post-group",
		Method:      http.MethodPost,
		Path:        "/api/groups",
		Summary:     "Create a group",
	}, func(ctx context.Context, input *PostGroupInput) (*PostGroupOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}

		group, err := deps.groups.CreateGroup(ctx, userID, input.Body.Name)
		if err != nil {
			return nil, huma.Error500InternalServerError("failed to create group")
		}

		resp := &PostGroupOutput{}
		resp.Body = groupBodyFrom(group)
		return resp, nil
	})

	type GroupPathInput struct {
		Session string `cookie:"__Host-session"`
		GroupID string `path:"groupId"`
	}
	type GetGroupOutput struct {
		Body groupBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "get-group",
		Method:      http.MethodGet,
		Path:        "/api/groups/{groupId}",
		Summary:     "Get a group",
	}, func(ctx context.Context, input *GroupPathInput) (*GetGroupOutput, error) {
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}

		group, err := deps.groups.GetGroup(ctx, userID, input.GroupID)
		if errors.Is(err, store.ErrGroupNotFound) {
			return nil, huma.Error404NotFound("group not found")
		} else if err != nil {
			return nil, huma.Error500InternalServerError("failed to get group")
		}

		resp := &GetGroupOutput{}
		resp.Body = groupBodyFrom(group)
		return resp, nil
	})

	type PatchGroupInput struct {
		Session string `cookie:"__Host-session"`
		Origin  string `header:"Origin"`
		GroupID string `path:"groupId"`
		Body    struct {
			Name string `json:"name" required:"true" minLength:"1" maxLength:"100" doc:"Group name"`
		}
	}
	type PatchGroupOutput struct {
		Body groupBody
	}

	huma.Register(api, huma.Operation{
		OperationID: "patch-group",
		Method:      http.MethodPatch,
		Path:        "/api/groups/{groupId}",
		Summary:     "Rename a group",
	}, func(ctx context.Context, input *PatchGroupInput) (*PatchGroupOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}

		group, err := deps.groups.UpdateGroup(ctx, userID, input.GroupID, input.Body.Name)
		if errors.Is(err, store.ErrGroupNotFound) {
			return nil, huma.Error404NotFound("group not found")
		} else if err != nil {
			return nil, huma.Error500InternalServerError("failed to update group")
		}

		resp := &PatchGroupOutput{}
		resp.Body = groupBodyFrom(group)
		return resp, nil
	})

	type DeleteGroupInput struct {
		Session string `cookie:"__Host-session"`
		Origin  string `header:"Origin"`
		GroupID string `path:"groupId"`
	}
	type DeleteGroupOutput struct{}

	huma.Register(api, huma.Operation{
		OperationID: "delete-group",
		Method:      http.MethodDelete,
		Path:        "/api/groups/{groupId}",
		Summary:     "Delete a group and its items",
	}, func(ctx context.Context, input *DeleteGroupInput) (*DeleteGroupOutput, error) {
		if err := validateOrigin(input.Origin, deps.appOrigin); err != nil {
			return nil, huma.Error403Forbidden(err.Error())
		}
		userID, err := authenticateSession(ctx, deps.sessions, input.Session)
		if err != nil {
			return nil, err
		}

		// DeleteGroup is idempotent (deleting an already-gone group is not an
		// error), so a retried DELETE also succeeds, per the proposal's
		// retry-safety requirement.
		if err := deps.groups.DeleteGroup(ctx, userID, input.GroupID); err != nil {
			return nil, huma.Error500InternalServerError("failed to delete group")
		}

		return &DeleteGroupOutput{}, nil
	})
}
